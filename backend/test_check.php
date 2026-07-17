<?php

require_once __DIR__.'/vendor/autoload.php';

$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Kernel::class);
$kernel->bootstrap();

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\State;
use Illuminate\Contracts\Console\Kernel;

echo "=== USERS WITH ROLES ===\n";
$users = User::with('roles')->get();
foreach ($users as $u) {
    $roles = $u->roles->pluck('name')->implode(',');
    echo "id={$u->id} email={$u->email} roles={$roles}\n";
}

echo "\n=== TEST QUERY FOR EACH USER ===\n";
$cerradaId = State::where('name', 'CERRADA')->value('id');
echo "CERRADA state_id = {$cerradaId}\n\n";

foreach ($users as $u) {
    $query = Incident::query();
    $query->whereHas('assignments', fn ($q) => $q->where('user_id', $u->id));
    $query->where('state_id', $cerradaId);
    $count = $query->count();
    echo "User {$u->id} ({$u->email}): closed incidents = {$count}\n";

    if ($count > 0) {
        $incidents = $query->get();
        foreach ($incidents as $i) {
            echo "  -> Incident #{$i->id} state_id={$i->state_id} state={$i->state?->name}\n";
        }
    }
}

echo "\nDone.\n";
