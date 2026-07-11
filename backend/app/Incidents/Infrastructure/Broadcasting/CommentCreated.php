<?php

namespace App\Incidents\Infrastructure\Broadcasting;

use App\Incidents\Application\DTOs\CommentData;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

final class CommentCreated implements ShouldBroadcast, ShouldDispatchAfterCommit
{
    use Dispatchable;
    use InteractsWithSockets;

    public function __construct(public readonly CommentData $comment) {}

    public function broadcastOn(): array
    {
        $channel = $this->comment->isInternal
            ? "incidents.{$this->comment->incidentId}.internal-comments"
            : "incidents.{$this->comment->incidentId}.comments";

        return [new PrivateChannel($channel)];
    }

    public function broadcastAs(): string
    {
        return 'comment.created';
    }

    public function broadcastWith(): array
    {
        return ['comment' => $this->comment->jsonSerialize()];
    }
}
