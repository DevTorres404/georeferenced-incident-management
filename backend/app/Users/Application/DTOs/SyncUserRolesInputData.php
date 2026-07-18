<?php

namespace App\Users\Application\DTOs;

final class SyncUserRolesInputData
{
    /**
     * @param  array<int, string>  $roleCodes
     */
    public function __construct(
        public readonly int $userId,
        public readonly array $roleCodes,
        public readonly ?int $assignedBy = null
    ) {}
}
