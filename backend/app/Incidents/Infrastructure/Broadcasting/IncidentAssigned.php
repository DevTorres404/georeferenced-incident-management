<?php

namespace App\Incidents\Infrastructure\Broadcasting;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

final class IncidentAssigned implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    use Dispatchable;
    use InteractsWithSockets;

    /**
     * @param  array<int, array{user_id: int, user_name: string, role: string}>  $assignments
     */
    public function __construct(
        private readonly int $incidentId,
        private readonly array $assignments,
        private readonly int $assignedByUserId,
        private readonly string $assignedByName,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("incidents.{$this->incidentId}.assignments"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'incident.assigned';
    }

    public function broadcastWith(): array
    {
        return [
            'incident_id' => $this->incidentId,
            'assignments' => $this->assignments,
            'assigned_by_user_id' => $this->assignedByUserId,
            'assigned_by_name' => $this->assignedByName,
        ];
    }
}
