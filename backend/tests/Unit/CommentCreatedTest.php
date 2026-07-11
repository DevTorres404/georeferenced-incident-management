<?php

namespace Tests\Unit;

use App\Incidents\Application\DTOs\CommentData;
use App\Incidents\Infrastructure\Broadcasting\CommentCreated;
use Tests\TestCase;

class CommentCreatedTest extends TestCase
{
    public function test_public_and_internal_comments_use_separate_private_channels(): void
    {
        $publicEvent = new CommentCreated(new CommentData(
            id: 10,
            incidentId: 42,
            userId: 7,
            comment: 'Comentario publico',
            isInternal: false,
            createdAt: null,
        ));
        $internalEvent = new CommentCreated(new CommentData(
            id: 11,
            incidentId: 42,
            userId: 7,
            comment: 'Comentario interno',
            isInternal: true,
            createdAt: null,
        ));

        $this->assertSame('private-incidents.42.comments', $publicEvent->broadcastOn()[0]->name);
        $this->assertSame('private-incidents.42.internal-comments', $internalEvent->broadcastOn()[0]->name);
        $this->assertSame('comment.created', $publicEvent->broadcastAs());
        $this->assertSame(10, $publicEvent->broadcastWith()['comment']['id']);
    }
}
