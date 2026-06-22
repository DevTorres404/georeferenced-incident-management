<?php

namespace App\Auth\Infrastructure\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class GoogleRegistrationUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $flowId,
        public string $status,
        public string $message,
        public array $payload = []
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel("auth.google.{$this->flowId}")];
    }

    public function broadcastAs(): string
    {
        return 'google.registration.updated';
    }

    public function broadcastWith(): array
    {
        return [
            'flow_id' => $this->flowId,
            'status' => $this->status,
            'message' => $this->message,
            'payload' => $this->payload,
        ];
    }
}
