<?php

namespace App\Incidents\Infrastructure\Broadcasting;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

final class IncidentStateChanged implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    use Dispatchable;
    use InteractsWithSockets;

    public function __construct(
        private readonly int $incidentId,
        private readonly int $newStateId,
        private readonly string $newStateName,
        private readonly ?int $previousStateId,
        private readonly ?string $previousStateName,
        private readonly int $changedByUserId,
        private readonly string $changedByName,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("incidents.{$this->incidentId}.state"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'incident.state.changed';
    }

    public function broadcastWith(): array
    {
        return [
            'incident_id' => $this->incidentId,
            'new_state_id' => $this->newStateId,
            'new_state_name' => $this->newStateName,
            'previous_state_id' => $this->previousStateId,
            'previous_state_name' => $this->previousStateName,
            'changed_by_user_id' => $this->changedByUserId,
            'changed_by_name' => $this->changedByName,
        ];
    }
}
