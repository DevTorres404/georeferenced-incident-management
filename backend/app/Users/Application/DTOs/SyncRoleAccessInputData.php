<?php

declare(strict_types=1);

namespace App\Users\Application\DTOs;

final readonly class SyncRoleAccessInputData
{
    /**
     * @param  array<int, string>  $permissionCodes
     * @param  array<int, string>  $navigationItemCodes
     */
    public function __construct(
        public int $roleId,
        public array $permissionCodes,
        public array $navigationItemCodes
    ) {}
}
