from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "ENTREGABLES" / "evidencias_hito6" / "logs"

SOURCE_ROOTS = [
    ROOT / "backend" / "app",
    ROOT / "backend" / "routes",
    ROOT / "backend" / "config",
    ROOT / "backend" / "tests",
    ROOT / "frontend" / "app" / "js",
    ROOT / "frontend" / "app" / "html",
    ROOT / "frontend" / "app" / "css",
]

EXTENSIONS = {".php", ".js", ".html", ".css"}
FUNCTION_PATTERNS = {
    ".php": re.compile(r"\bfunction\s+([A-Za-z_]\w*)\s*\("),
    ".js": re.compile(
        r"(?:\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\()"
        r"|(?:\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=.*?=>)"
    ),
}
DECISION_PATTERN = re.compile(
    r"\b(?:if|for|foreach|while|case|catch)\b|&&|\|\||\?\?"
)


def iter_files() -> list[Path]:
    files: list[Path] = []
    for source_root in SOURCE_ROOTS:
        if not source_root.exists():
            continue
        files.extend(
            path
            for path in source_root.rglob("*")
            if path.is_file() and path.suffix.lower() in EXTENSIONS
        )
    return sorted(set(files))


def classify_lines(lines: list[str]) -> dict[str, int]:
    blank = 0
    comment = 0
    in_block_comment = False

    for raw_line in lines:
        line = raw_line.strip()
        if not line:
            blank += 1
            continue
        if in_block_comment:
            comment += 1
            if "*/" in line:
                in_block_comment = False
            continue
        if line.startswith("/*"):
            comment += 1
            if "*/" not in line:
                in_block_comment = True
            continue
        if line.startswith(("//", "#", "<!--", "*")):
            comment += 1

    return {
        "total": len(lines),
        "blank": blank,
        "comment": comment,
        "code": len(lines) - blank - comment,
    }


def extract_functions(path: Path, lines: list[str]) -> list[dict[str, int | str]]:
    pattern = FUNCTION_PATTERNS.get(path.suffix.lower())
    if pattern is None:
        return []

    functions: list[dict[str, int | str]] = []
    index = 0
    while index < len(lines):
        match = pattern.search(lines[index])
        if not match:
            index += 1
            continue

        name = next((group for group in match.groups() if group), "anonymous")
        start = index
        brace_index = index
        while brace_index < len(lines) and "{" not in lines[brace_index]:
            brace_index += 1
        if brace_index >= len(lines):
            index += 1
            continue

        depth = 0
        opened = False
        end = brace_index
        for cursor in range(brace_index, len(lines)):
            line = re.sub(r"//.*$", "", lines[cursor])
            depth += line.count("{")
            if line.count("{"):
                opened = True
            depth -= line.count("}")
            end = cursor
            if opened and depth <= 0:
                break

        body = "\n".join(lines[start : end + 1])
        complexity = 1 + len(DECISION_PATTERN.findall(body))
        functions.append(
            {
                "file": str(path.relative_to(ROOT)).replace("\\", "/"),
                "name": name,
                "start_line": start + 1,
                "end_line": end + 1,
                "lines": end - start + 1,
                "cyclomatic_estimate": complexity,
            }
        )
        index = max(index + 1, end + 1)

    return functions


def pattern_findings(path: Path, text: str) -> list[dict[str, str | int]]:
    patterns = {
        "raw_sql": re.compile(r"\b(?:DB::raw|selectRaw|whereRaw|orderByRaw|statement)\b"),
        "dom_inner_html": re.compile(r"\binnerHTML\b"),
        "dynamic_code": re.compile(r"\b(?:eval|new\s+Function)\s*\("),
        "browser_storage": re.compile(r"\b(?:localStorage|sessionStorage)\b"),
        "cleartext_http": re.compile(r"http://"),
    }
    findings: list[dict[str, str | int]] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        for category, pattern in patterns.items():
            if pattern.search(line):
                findings.append(
                    {
                        "category": category,
                        "file": str(path.relative_to(ROOT)).replace("\\", "/"),
                        "line": line_number,
                        "excerpt": line.strip()[:180],
                    }
                )
    return findings


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    files = iter_files()
    by_extension: dict[str, Counter[str]] = {}
    file_metrics: list[dict[str, str | int]] = []
    functions: list[dict[str, int | str]] = []
    findings: list[dict[str, str | int]] = []
    php_files = 0
    strict_php_files = 0
    domain_framework_violations: list[str] = []
    application_facade_violations: list[str] = []

    for path in files:
        text = path.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()
        line_metrics = classify_lines(lines)
        extension = path.suffix.lower()
        by_extension.setdefault(extension, Counter()).update(line_metrics)
        relative = str(path.relative_to(ROOT)).replace("\\", "/")
        file_metrics.append({"file": relative, **line_metrics})
        functions.extend(extract_functions(path, lines))
        findings.extend(pattern_findings(path, text))

        if extension == ".php":
            php_files += 1
            if "declare(strict_types=1);" in text:
                strict_php_files += 1
            if "/Domain/" in f"/{relative}" and re.search(r"\bIlluminate\\", text):
                domain_framework_violations.append(relative)
            if "/Application/" in f"/{relative}" and re.search(
                r"Illuminate\\Support\\Facades|\b(?:DB|Log)::", text
            ):
                application_facade_violations.append(relative)

    totals = Counter()
    for metrics in by_extension.values():
        totals.update(metrics)

    result = {
        "scope": [str(path.relative_to(ROOT)).replace("\\", "/") for path in SOURCE_ROOTS],
        "files_analyzed": len(files),
        "line_totals": dict(totals),
        "by_extension": {key: dict(value) for key, value in sorted(by_extension.items())},
        "php_strict_types": {
            "files": php_files,
            "with_strict_types": strict_php_files,
            "coverage_percent": round((strict_php_files / php_files * 100) if php_files else 0, 2),
        },
        "architecture": {
            "domain_framework_violations": domain_framework_violations,
            "application_facade_violations": application_facade_violations,
        },
        "largest_files": sorted(file_metrics, key=lambda item: int(item["code"]), reverse=True)[:15],
        "longest_functions": sorted(functions, key=lambda item: int(item["lines"]), reverse=True)[:20],
        "highest_complexity_functions": sorted(
            functions,
            key=lambda item: int(item["cyclomatic_estimate"]),
            reverse=True,
        )[:20],
        "functions_over_60_lines": sum(int(item["lines"]) > 60 for item in functions),
        "functions_complexity_over_10": sum(
            int(item["cyclomatic_estimate"]) > 10 for item in functions
        ),
        "pattern_counts": dict(Counter(str(item["category"]) for item in findings)),
        "pattern_samples": findings[:250],
    }

    json_path = OUTPUT_DIR / "metricas_estaticas.json"
    json_path.write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

    summary = [
        "HITO 6 - METRICAS ESTATICAS HEURISTICAS",
        f"Archivos analizados: {result['files_analyzed']}",
        f"Lineas totales: {totals['total']}",
        f"Lineas de codigo: {totals['code']}",
        f"Lineas comentario: {totals['comment']}",
        f"Lineas en blanco: {totals['blank']}",
        (
            "PHP con strict_types: "
            f"{strict_php_files}/{php_files} "
            f"({result['php_strict_types']['coverage_percent']}%)"
        ),
        f"Funciones > 60 lineas: {result['functions_over_60_lines']}",
        f"Funciones con complejidad estimada > 10: {result['functions_complexity_over_10']}",
        f"Violaciones Domain -> Illuminate: {len(domain_framework_violations)}",
        f"Facades en Application: {len(application_facade_violations)}",
        "",
        "Top 8 archivos por LOC de codigo:",
    ]
    for item in result["largest_files"][:8]:
        summary.append(f"  {item['code']:>5}  {item['file']}")
    summary.extend(["", "Top 8 funciones por complejidad estimada:"])
    for item in result["highest_complexity_functions"][:8]:
        summary.append(
            f"  CC~{item['cyclomatic_estimate']:>3}  "
            f"{item['file']}:{item['start_line']}::{item['name']} ({item['lines']} lineas)"
        )

    (OUTPUT_DIR / "metricas_estaticas.txt").write_text("\n".join(summary) + "\n", encoding="utf-8")
    print("\n".join(summary))


if __name__ == "__main__":
    main()
