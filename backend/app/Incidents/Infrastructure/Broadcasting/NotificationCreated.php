<?php

namespace App\Incidents\Infrastructure\Broadcasting;

use App\Incidents\Application\DTOs\NotificationData;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;

final class NotificationCreated implements ShouldBroadcast
{
    use Dispatchable;
    use InteractsWithSockets;

    public function __construct(private readonly NotificationData $notification) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("users.{$this->notification->userId}.notifications"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'notification.created';
    }

    public function broadcastWith(): array
    {
        return [
            'notification' => $this->notification->jsonSerialize(),
        ];
    }
}
