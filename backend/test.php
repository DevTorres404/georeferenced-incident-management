<?php
require 'vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

try {
    $uc = app(App\Operations\Application\UseCases\OperatorWorkReportUseCase::class);
    $res = $uc->generate(10);
    echo json_encode($res, JSON_PRETTY_PRINT);
} catch (\Exception $e) {
    echo "ERROR: " . $e->getMessage() . "\n" . $e->getTraceAsString();
}
