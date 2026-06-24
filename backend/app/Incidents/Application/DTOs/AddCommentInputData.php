<?php

namespace App\Incidents\Application\DTOs;

final class AddCommentInputData
{
    public function __construct(
        public readonly string $comment,
        public readonly bool $isInternal = false
    ) {
    }
}
