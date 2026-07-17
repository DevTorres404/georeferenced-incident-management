<?php

use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAttachment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentComment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentCycle;
use App\Incidents\Infrastructure\Persistence\Models\IncidentState;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (app()->environment('testing')) {
            return;
        }

        DB::transaction(function () {
            $incidents = Incident::query()
                ->whereNull('current_cycle_id')
                ->get();

            foreach ($incidents as $incident) {
                $cycle = IncidentCycle::create([
                    'incident_id' => $incident->id,
                    'cycle_number' => 1,
                    'opened_at' => $incident->created_at ?? now(),
                    'opened_by' => $incident->reported_by_id ?? 1,
                    'resolved_at' => $incident->resolution_date,
                    'resolved_by' => $incident->resolved_by_supervisor_id,
                    'closed_at' => null,
                    'closed_by' => null,
                ]);

                IncidentState::query()
                    ->where('incident_id', $incident->id)
                    ->whereNull('incident_cycle_id')
                    ->update(['incident_cycle_id' => $cycle->id]);

                IncidentComment::query()
                    ->where('incident_id', $incident->id)
                    ->whereNull('incident_cycle_id')
                    ->update(['incident_cycle_id' => $cycle->id]);

                IncidentAttachment::query()
                    ->where('incident_id', $incident->id)
                    ->whereNull('incident_cycle_id')
                    ->update(['incident_cycle_id' => $cycle->id]);

                IncidentAssignment::query()
                    ->where('incident_id', $incident->id)
                    ->whereNull('incident_cycle_id')
                    ->update(['incident_cycle_id' => $cycle->id]);

                $incident->forceFill(['current_cycle_id' => $cycle->id])->save();
            }
        });
    }

    public function down(): void
    {
        // Irreversible — data migration
    }
};
