<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

try {
    $incident = new \App\Incidents\Infrastructure\Persistence\Models\Incident();
    $incident->title = 'Test';
    $incident->description = 'Test';
    $incident->category_id = 1;
    $incident->subcategory_id = 1;
    $incident->priority_id = 1;
    $incident->state_id = 1;
    $incident->city_id = 1;
    $incident->address = 'Test';
    $incident->save();
    echo 'OK';
} catch (\Exception $e) {
    echo 'Error: ' . $e->getMessage();
}
