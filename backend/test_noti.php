<?php

require __DIR__ . '/vendor/autoload.php';
$app = require_once __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use Illuminate\Support\Facades\DB;

$incident = Incident::query()
    ->with(['category', 'priority', 'territorialUnit.' . TerritorialUnit::PARENT_CHAIN])
    ->latest()
    ->first();

echo "=== INCIDENT ===\n";
echo "ID: {$incident->id} | Code: {$incident->code}\n";
echo "Lat: {$incident->latitude} | Lng: {$incident->longitude}\n";
echo "Territorial Unit ID: " . ($incident->territorial_unit_id ?? 'NULL') . "\n";
echo "Reporter User ID: {$incident->reported_by_id}\n";

// Step 1: Try spatial resolution
echo "\n=== SPATIAL ZONE RESOLUTION ===\n";
if ($incident->latitude && $incident->longitude) {
    try {
        $spatialZone = TerritorialUnit::query()
            ->where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)
            ->where('is_active', true)
            ->whereNotNull('coverage_area')
            ->whereRaw(
                'ST_Within(ST_SetSRID(ST_MakePoint(?, ?), 4326), coverage_area)',
                [(float) $incident->longitude, (float) $incident->latitude]
            )
            ->first();
        
        if ($spatialZone) {
            echo "Spatial zone found: {$spatialZone->id} - {$spatialZone->name}\n";
        } else {
            echo "No spatial zone found for coordinates.\n";
        }
    } catch (\Throwable $e) {
        echo "Spatial query FAILED: " . $e->getMessage() . "\n";
    }
} else {
    echo "No coordinates on incident.\n";
}

// Step 2: Hierarchical resolution
echo "\n=== HIERARCHICAL ZONE RESOLUTION ===\n";
$territory = $incident->territorialUnit;
if ($territory) {
    echo "Territory: {$territory->id} - {$territory->name} (type: {$territory->type})\n";
    
    // Walk up
    $current = $territory;
    $depth = 0;
    while ($current) {
        echo "  [{$depth}] ID: {$current->id} | Name: {$current->name} | Type: {$current->type} | Parent ID: " . ($current->parent_id ?? 'NULL') . "\n";
        if ($current->type === TerritorialUnit::TYPE_OPERATIONAL_ZONE) {
            echo "  >>> FOUND OPERATIONAL ZONE: {$current->id} - {$current->name}\n";
            break;
        }
        $current = $current->parent;
        $depth++;
    }
} else {
    echo "No territorial unit assigned to incident.\n";
}

// Step 3: Check all operational zones
echo "\n=== ALL OPERATIONAL ZONES ===\n";
$zones = TerritorialUnit::where('type', TerritorialUnit::TYPE_OPERATIONAL_ZONE)->where('is_active', true)->get();
foreach ($zones as $z) {
    echo "Zone ID: {$z->id} | Name: {$z->name} | Parent ID: " . ($z->parent_id ?? 'NULL') . "\n";
}

// Step 4: Check supervisors per zone
echo "\n=== SUPERVISORS PER ZONE ===\n";
foreach ($zones as $z) {
    $supervisors = UserTerritory::query()
        ->active()
        ->where('territorial_unit_id', $z->id)
        ->whereHas('user', fn ($q) => $q
            ->where('is_active', true)
            ->whereHas('roles', fn ($rq) => $rq
                ->where('code', 'SUPERVISOR')
                ->where('is_active', true)
                ->whereHas('permissions', fn ($pq) => $pq
                    ->where('code', 'notifications.view'))))
        ->pluck('user_id')
        ->all();
    
    echo "Zone '{$z->name}' (ID: {$z->id}): Supervisors = " . json_encode($supervisors) . "\n";
}

// Step 5: Recent notifications for this incident
echo "\n=== NOTIFICATIONS FOR INCIDENT {$incident->id} ===\n";
$notifications = DB::table('core.notifications')
    ->where('incident_id', $incident->id)
    ->get();

if ($notifications->isEmpty()) {
    echo "NO notifications found.\n";
} else {
    foreach ($notifications as $n) {
        echo "  User: {$n->user_id} | Title: {$n->title} | Message: {$n->message} | Read: " . ($n->is_read ? 'yes' : 'no') . "\n";
    }
}
