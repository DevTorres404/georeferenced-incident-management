<?php

namespace App\Incidents\Infrastructure\Persistence\Mappers;

use App\Incidents\Application\DTOs\CommentData;
use App\Incidents\Infrastructure\Persistence\Models\IncidentComment;

final class CommentMapper
{
    public function __construct(private UserSummaryMapper $userSummaryMapper) {}

    public function fromModel(IncidentComment $comment): CommentData
    {
        return new CommentData(
            id: (int) $comment->id,
            incidentId: (int) $comment->incident_id,
            userId: (int) $comment->user_id,
            comment: $comment->comment,
            isInternal: (bool) $comment->is_internal,
            createdAt: $comment->created_at?->toIso8601String(),
            user: $comment->relationLoaded('user') && $comment->user
                ? $this->userSummaryMapper->fromModel($comment->user)
                : null
        );
    }
}
