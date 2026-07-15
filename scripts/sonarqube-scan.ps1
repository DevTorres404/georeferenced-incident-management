[CmdletBinding()]
param(
    [string]$ValidateCloverPath,
    [string]$ValidateJUnitPath,
    [string]$ValidateGitRoot,
    [string]$ExpectedGitCommit,
    [datetime]$MinimumReportTimestampUtc = [datetime]::MinValue
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$RootDir = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ComposeFile = Join-Path $RootDir 'docker-compose.sonar.yml'
$EnvFile = Join-Path $RootDir '.env'
$Baseline = Join-Path $RootDir 'docs/e6/logs/linea-base-analisis.txt'
$CoverageLog = Join-Path $RootDir 'docs/e6/logs/phpunit-coverage.log'
$ScannerLog = Join-Path $RootDir 'docs/e6/logs/sonar-scanner.log'
$Compose = @('compose', '--project-directory', $RootDir, '-f', $ComposeFile)

function Invoke-NativeCapture([string]$FilePath, [string[]]$Arguments) {
    $PreviousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $Output = @(& $FilePath @Arguments 2>&1)
        $ExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $PreviousPreference
    }
    [pscustomobject]@{ Output = $Output; ExitCode = $ExitCode }
}

function Convert-OutputToText($Result) {
    (($Result.Output | ForEach-Object { "$_" }) -join "`n").Trim()
}

function Assert-GitProvenance([string]$RepositoryPath, [string]$ExpectedCommit) {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        throw 'Git is required to verify analysis provenance.'
    }

    $HeadResult = Invoke-NativeCapture 'git' @('-C', $RepositoryPath, 'rev-parse', 'HEAD')
    $StatusResult = Invoke-NativeCapture 'git' @('-C', $RepositoryPath, 'status', '--porcelain')
    if ($HeadResult.ExitCode -ne 0 -or $StatusResult.ExitCode -ne 0) {
        throw 'Git could not revalidate HEAD, the index, and the worktree.'
    }

    $CurrentCommit = Convert-OutputToText $HeadResult
    if ($CurrentCommit -ne $ExpectedCommit) {
        throw "Git HEAD changed after coverage (expected $ExpectedCommit, found $CurrentCommit)."
    }
    if (Convert-OutputToText $StatusResult) {
        throw 'The Git index or worktree changed after coverage.'
    }
}

function Invoke-DockerLogged([string[]]$Arguments, [string]$LogPath) {
    $PreviousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & docker @Arguments 2>&1 | Tee-Object -FilePath $LogPath | ForEach-Object { Write-Host "$_" }
        $ExitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $PreviousPreference
    }
    $ExitCode
}

function Invoke-TestDatabaseCleanup {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { return }
    [void](Invoke-NativeCapture 'docker' ($Compose + @('--profile', 'analysis', 'stop', 'backend-test-db')))
    [void](Invoke-NativeCapture 'docker' ($Compose + @('--profile', 'analysis', 'rm', '-f', 'backend-test-db')))
}

function Get-RequiredXmlInteger($Node, [string]$AttributeName, [string]$Context) {
    $Attribute = $Node.Attributes.GetNamedItem($AttributeName)
    [long]$Value = 0
    if ($null -eq $Attribute -or
        -not [long]::TryParse($Attribute.Value, [ref]$Value) -or
        $Value -lt 0) {
        throw "$Context has an invalid $AttributeName metric."
    }
    $Value
}

function Read-XmlReport([string]$Path, [string]$Name) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf) -or (Get-Item -LiteralPath $Path).Length -eq 0) {
        throw "$Name report is missing or empty: $Path"
    }

    try {
        [xml](Get-Content -LiteralPath $Path -Raw)
    } catch {
        throw "$Name report is malformed XML: $Path"
    }
}

function Assert-AnalysisReports(
    [string]$CloverPath,
    [string]$JUnitPath,
    [datetime]$NotOlderThanUtc = [datetime]::MinValue
) {
    $Junit = Read-XmlReport $JUnitPath 'JUnit'
    $TestSuites = $Junit.SelectSingleNode('/testsuites')
    if ($null -eq $TestSuites) { throw 'JUnit does not contain a testsuites root.' }

    $SuiteNodes = $Junit.SelectNodes('/testsuites/testsuite')
    if ($SuiteNodes.Count -eq 0) { throw 'JUnit does not contain any test suites.' }

    [long]$Tests = 0
    [long]$Assertions = 0
    [long]$Failures = 0
    [long]$Errors = 0
    foreach ($SuiteNode in $SuiteNodes) {
        $Tests += Get-RequiredXmlInteger $SuiteNode 'tests' 'JUnit test suite'
        $Assertions += Get-RequiredXmlInteger $SuiteNode 'assertions' 'JUnit test suite'
        $Failures += Get-RequiredXmlInteger $SuiteNode 'failures' 'JUnit test suite'
        $Errors += Get-RequiredXmlInteger $SuiteNode 'errors' 'JUnit test suite'
    }
    if ($Tests -eq 0) { throw 'PHPUnit executed zero tests.' }
    if ($Failures -ne 0 -or $Errors -ne 0) {
        throw "JUnit reports $Failures failures and $Errors errors."
    }

    $Clover = Read-XmlReport $CloverPath 'Clover'
    $Coverage = $Clover.SelectSingleNode('/coverage')
    $Project = $Clover.SelectSingleNode('/coverage/project')
    $Metrics = $Clover.SelectSingleNode('/coverage/project/metrics')
    $Files = $Clover.SelectNodes('/coverage/project//file')
    $Lines = $Clover.SelectNodes('/coverage/project//file/line')
    if ($null -eq $Coverage -or $null -eq $Project) {
        throw 'Clover does not contain the required coverage/project structure.'
    }
    if ($null -eq $Metrics -or $Files.Count -eq 0 -or $Lines.Count -eq 0) {
        throw 'Clover does not contain source files, executable lines, and project metrics.'
    }

    $FileCount = Get-RequiredXmlInteger $Metrics 'files' 'Clover project'
    $LineCount = Get-RequiredXmlInteger $Metrics 'loc' 'Clover project'
    $Statements = Get-RequiredXmlInteger $Metrics 'statements' 'Clover project'
    $CoveredStatements = Get-RequiredXmlInteger $Metrics 'coveredstatements' 'Clover project'
    if ($FileCount -eq 0 -or $LineCount -eq 0 -or $Statements -eq 0) {
        throw 'Clover project coverage metrics are empty.'
    }

    if ($NotOlderThanUtc -ne [datetime]::MinValue) {
        $Threshold = $NotOlderThanUtc.ToUniversalTime().AddSeconds(-2)
        if ((Get-Item -LiteralPath $JUnitPath).LastWriteTimeUtc -lt $Threshold -or
            (Get-Item -LiteralPath $CloverPath).LastWriteTimeUtc -lt $Threshold) {
            throw 'JUnit or Clover predates the current coverage run.'
        }
    }

    [pscustomobject]@{
        Tests = $Tests
        Assertions = $Assertions
        Failures = $Failures
        Errors = $Errors
        Files = $FileCount
        Lines = $LineCount
        Statements = $Statements
        CoveredStatements = $CoveredStatements
    }
}

if ($ValidateCloverPath -or $ValidateJUnitPath) {
    if (-not $ValidateCloverPath -or -not $ValidateJUnitPath) {
        throw 'Both ValidateCloverPath and ValidateJUnitPath are required.'
    }
    Assert-AnalysisReports $ValidateCloverPath $ValidateJUnitPath $MinimumReportTimestampUtc
    return
}

if ($ValidateGitRoot -or $ExpectedGitCommit) {
    if (-not $ValidateGitRoot -or -not $ExpectedGitCommit) {
        throw 'Both ValidateGitRoot and ExpectedGitCommit are required.'
    }
    Assert-GitProvenance $ValidateGitRoot $ExpectedGitCommit
    return
}

New-Item -ItemType Directory -Force (Join-Path $RootDir 'backend/build/logs'), (Join-Path $RootDir 'docs/e6/logs') | Out-Null

$StartedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$Commit = 'NOT_AVAILABLE'
$ProjectVersion = 'NOT_PUBLISHED'
$Branch = 'DETACHED_OR_NOT_AVAILABLE'
$Dirty = 'NOT_AVAILABLE'
$DockerVersion = 'NOT_AVAILABLE'
$NodeVersion = 'NOT_AVAILABLE'
$PhpVersion = 'NOT_AVAILABLE'
$ComposerVersion = 'NOT_AVAILABLE'
$SonarQubeVersion = 'NOT_AVAILABLE'
$SonarQubeImageId = 'NOT_AVAILABLE'
$TestResult = 'NOT_RUN'
$ScanResult = 'NOT_RUN'
$CurrentPhase = 'preflight'

function Write-Baseline {
    @(
        "GIT_COMMIT=$Commit"
        "SONAR_PROJECT_VERSION=$ProjectVersion"
        "GIT_BRANCH=$Branch"
        "DIRTY=$Dirty"
        'NOTE=Official analysis requires a clean, available Git worktree before tests or scanner execution.'
        "ANALYSIS_STARTED_AT_UTC=$StartedAt"
        "ANALYSIS_FINISHED_AT_UTC=$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
        "DOCKER_VERSION=$DockerVersion"
        "PHP_VERSION=$PhpVersion"
        "COMPOSER_VERSION=$ComposerVersion"
        "NODE_VERSION=$NodeVersion"
        "SONARQUBE_VERSION=$SonarQubeVersion"
        "SONARQUBE_IMAGE_ID=$SonarQubeImageId"
        "TEST_RESULT=$TestResult"
        "SCAN_AND_QUALITY_GATE_RESULT=$ScanResult"
    ) | Set-Content -Encoding utf8 $Baseline
}

Write-Baseline

try {
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        $TestResult = 'FAIL(git_unavailable)'
        $ScanResult = 'NOT_RUN_GIT_UNAVAILABLE'
        throw 'Git is required to produce a trustworthy analysis baseline.'
    }

    $CommitResult = Invoke-NativeCapture 'git' @('-C', $RootDir, 'rev-parse', 'HEAD')
    $ProjectVersionResult = Invoke-NativeCapture 'git' @('-C', $RootDir, 'rev-parse', '--short=12', 'HEAD')
    $BranchResult = Invoke-NativeCapture 'git' @('-C', $RootDir, 'branch', '--show-current')
    $StatusResult = Invoke-NativeCapture 'git' @('-C', $RootDir, 'status', '--porcelain')

    if ($CommitResult.ExitCode -ne 0 -or $ProjectVersionResult.ExitCode -ne 0 -or
        $BranchResult.ExitCode -ne 0 -or $StatusResult.ExitCode -ne 0) {
        $Dirty = 'NOT_AVAILABLE'
        $TestResult = 'FAIL(git_unavailable)'
        $ScanResult = 'NOT_RUN_GIT_UNAVAILABLE'
        throw 'Git could not inspect HEAD and the worktree; analysis was not started.'
    }

    $Commit = Convert-OutputToText $CommitResult
    $ResolvedProjectVersion = Convert-OutputToText $ProjectVersionResult
    $ResolvedBranch = Convert-OutputToText $BranchResult
    if ($ResolvedBranch) { $Branch = $ResolvedBranch }

    if (Convert-OutputToText $StatusResult) {
        $Dirty = 'true'
        $TestResult = 'FAIL(dirty_worktree)'
        $ScanResult = 'NOT_RUN_DIRTY_WORKTREE'
        Write-Baseline
        throw 'The official analysis requires a clean Git worktree. Commit or stash all changes first.'
    }

    $Dirty = 'false'
    $ProjectVersion = $ResolvedProjectVersion
    Write-Baseline

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker is not installed or is not in PATH.' }
    $DockerInfo = Invoke-NativeCapture 'docker' @('info')
    if ($DockerInfo.ExitCode -ne 0) { throw 'Docker is not running or the current user cannot access it.' }
    $ComposeVersion = Invoke-NativeCapture 'docker' @('compose', 'version')
    if ($ComposeVersion.ExitCode -ne 0) { throw 'Docker Compose v2 is required.' }
    $DockerVersionResult = Invoke-NativeCapture 'docker' @('version', '--format', '{{.Server.Version}}')
    if ($DockerVersionResult.ExitCode -eq 0) { $DockerVersion = Convert-OutputToText $DockerVersionResult }
    if (Get-Command node -ErrorAction SilentlyContinue) {
        $NodeResult = Invoke-NativeCapture 'node' @('--version')
        if ($NodeResult.ExitCode -eq 0) { $NodeVersion = Convert-OutputToText $NodeResult }
    }
    if (-not (Test-Path $EnvFile)) { throw "Missing $EnvFile. Copy .env.example to .env and configure it." }

    $Token = $env:SONAR_TOKEN
    if ([string]::IsNullOrWhiteSpace($Token)) {
        $TokenLine = Get-Content $EnvFile | Where-Object { $_ -match '^\s*SONAR_TOKEN\s*=' } | Select-Object -Last 1
        if ($TokenLine) { $Token = (($TokenLine -split '=', 2)[1]).Trim().Trim('"').Trim("'") }
    }
    if ([string]::IsNullOrWhiteSpace($Token)) { throw 'SONAR_TOKEN is empty. Create a token in SonarQube and set it in .env or the process environment.' }
    Remove-Variable Token

    $CurrentPhase = 'sonarqube_startup'
    & (Join-Path $PSScriptRoot 'sonarqube-up.ps1')
    $ContainerResult = Invoke-NativeCapture 'docker' ($Compose + @('ps', '-q', 'sonarqube'))
    $ContainerId = Convert-OutputToText $ContainerResult
    if ($ContainerResult.ExitCode -eq 0 -and $ContainerId) {
        $ImageResult = Invoke-NativeCapture 'docker' @('inspect', '--format', '{{.Config.Image}}', $ContainerId)
        if ($ImageResult.ExitCode -eq 0) { $SonarQubeVersion = Convert-OutputToText $ImageResult }
        $ImageIdResult = Invoke-NativeCapture 'docker' @('inspect', '--format', '{{.Image}}', $ContainerId)
        if ($ImageIdResult.ExitCode -eq 0) { $SonarQubeImageId = Convert-OutputToText $ImageIdResult }
    }
    Write-Baseline

    $CurrentPhase = 'php_coverage'
    Write-Host 'Building the isolated PHP analysis image and generating real Clover coverage...'
    $CoverageStartedAt = (Get-Date).ToUniversalTime()
    $CoverageStatus = Invoke-DockerLogged ($Compose + @('--profile', 'analysis', 'run', '--rm', '--build', 'backend-coverage')) $CoverageLog

    $VersionResult = Invoke-NativeCapture 'docker' ($Compose + @('--profile', 'analysis', 'run', '--rm', '--no-deps', 'backend-coverage', 'sh', '-lc', 'php -v | head -n 1; composer --version --no-ansi'))
    if ($VersionResult.ExitCode -eq 0) {
        $VersionOutput = $VersionResult.Output | ForEach-Object { "$_" }
        $PhpLine = $VersionOutput | Where-Object { $_ -match '^PHP ' } | Select-Object -First 1
        if ($PhpLine) { $PhpVersion = $PhpLine }
        $ComposerLine = $VersionOutput | Where-Object { $_ -match '^Composer version ' } | Select-Object -First 1
        if ($ComposerLine) { $ComposerVersion = $ComposerLine }
    }

    if ($CoverageStatus -ne 0) {
        $TestResult = "FAIL(exit=$CoverageStatus)"
        $ScanResult = 'NOT_RUN_COVERAGE_FAILED'
        throw "PHP tests or Clover generation failed (exit $CoverageStatus). Scanner was not run; see docs/e6/logs/phpunit-coverage.log."
    }
    $Clover = Join-Path $RootDir 'backend/build/logs/clover.xml'
    $JUnit = Join-Path $RootDir 'backend/build/logs/junit.xml'
    try {
        $ReportSummary = Assert-AnalysisReports $Clover $JUnit $CoverageStartedAt
    } catch {
        $TestResult = 'FAIL(report_validation)'
        $ScanResult = 'NOT_RUN_INVALID_COVERAGE_REPORTS'
        throw
    }
    $TestResult = "PASS(tests=$($ReportSummary.Tests),assertions=$($ReportSummary.Assertions))"
    Write-Host "Validated fresh reports: tests=$($ReportSummary.Tests), assertions=$($ReportSummary.Assertions), files=$($ReportSummary.Files), statements=$($ReportSummary.Statements), covered=$($ReportSummary.CoveredStatements)."

    $CurrentPhase = 'js_coverage'
    Write-Host 'Running JS tests with Vitest for coverage...'
    $JsCoverageLog = Join-Path $RootDir 'docs/e6/logs/vitest-coverage.log'
    $VitestRoot = Join-Path $RootDir 'frontend'
    # Ensure coverage directory exists so Docker volume mount doesn't fail
    $Null = New-Item -ItemType Directory -Path (Join-Path $VitestRoot 'coverage') -Force 2>&1
    $VitestExit = 0
    $VitestOutput = @(& npm --prefix $VitestRoot run test:js:coverage 2>&1)
    $VitestOutput | Out-File -FilePath $JsCoverageLog -Encoding utf8 -Force
    if ($LASTEXITCODE -ne 0) { $VitestExit = $LASTEXITCODE }
    Write-Host ($VitestOutput -join "`n")
    if ($VitestExit -ne 0) {
        Write-Host "JS tests failed (exit $VitestExit). Proceeding with SonarScanner anyway (coverage may be partial)."
    }
    $JsLcov = Join-Path $VitestRoot 'coverage/lcov.info'
    if (Test-Path $JsLcov) {
        Write-Host "JS coverage lcov.info generated successfully."
        # Convert paths to Docker container paths (/usr/src/...)
        # Vitest uses paths relative to frontend/ (e.g., app/js/foo.js)
        # SonarQube expects paths relative to project base (/usr/src/), so:
        #   app/js/foo.js -> frontend/app/js/foo.js
        $LcovLines = Get-Content $JsLcov
        $LcovLines = $LcovLines | ForEach-Object {
            $line = $_
            # Normalize backslashes
            $line = $line -replace '\\', '/'
            # Convert absolute Windows paths: remove host root, add /usr/src/
            $line = $line -replace [regex]::Escape(($RootDir -replace '\\', '/') + '/'), '/usr/src/'
            # Convert relative paths: app/js/foo.js -> frontend/app/js/foo.js
            if ($line -match '^SF:(?!usr/src/|backend/|frontend/)') {
                $line = $line -replace '^SF:', 'SF:frontend/'
            }
            $line
        }
        $LcovContent = $LcovLines -join "`n"
        Set-Content -Path $JsLcov -Value $LcovContent -NoNewline
        Write-Host "JS coverage paths normalized for Docker container."
    } else {
        Write-Host "Warning: JS coverage lcov.info not found at $JsLcov. Proceeding without JS coverage."
    }

    $CurrentPhase = 'scanner_and_quality_gate'
    Write-Host 'Running SonarScanner and waiting for background processing and the Quality Gate...'
    try {
        Assert-GitProvenance $RootDir $Commit
    } catch {
        $ScanResult = 'NOT_RUN_SOURCE_PROVENANCE_CHANGED'
        throw
    }
    $ScannerStatus = Invoke-DockerLogged ($Compose + @('--profile', 'analysis', 'run', '--rm', 'sonar-scanner', "-Dsonar.projectVersion=$ProjectVersion")) $ScannerLog
    $ScanResult = if ($ScannerStatus -eq 0) { 'PASS(analysis_processed_and_quality_gate_passed)' } else { "FAIL(exit=$ScannerStatus)" }
    if ($ScannerStatus -ne 0) { throw "SonarScanner, background processing, or the Quality Gate failed (exit $ScannerStatus). See docs/e6/logs/sonar-scanner.log." }

    Write-Baseline
    Write-Host "Analysis processing completed and the Quality Gate passed. Baseline: $Baseline"
} catch {
    if ($TestResult -eq 'NOT_RUN') { $TestResult = "FAIL($CurrentPhase)" }
    if ($ScanResult -eq 'NOT_RUN') { $ScanResult = "NOT_RUN(failure_during_$CurrentPhase)" }
    Write-Baseline
    throw
} finally {
    Invoke-TestDatabaseCleanup
}
