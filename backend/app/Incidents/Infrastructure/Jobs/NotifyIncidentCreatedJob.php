<?php

namespace App\Incidents\Infrastructure\Jobs;

use App\Incidents\Infrastructure\Persistence\Repositories\EloquentIncidentRepository;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;

final class NotifyIncidentCreatedJob implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    public function __construct(
        public readonly int $incidentId,
        public readonly int $reporterUserId
    ) {}

    public function handle(EloquentIncidentRepository $repository): void
    {
        $repository->notifyCreatedIncident($this->incidentId, $this->reporterUserId);
    }
}
