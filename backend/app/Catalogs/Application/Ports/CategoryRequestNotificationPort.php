<?php

declare(strict_types=1);

namespace App\Catalogs\Application\Ports;

use App\Catalogs\Application\DTOs\CategoryRequestData;

interface CategoryRequestNotificationPort
{
    public function notifyRequested(CategoryRequestData $request): void;

    public function notifyApproved(CategoryRequestData $request): void;

    public function notifyRejected(CategoryRequestData $request, string $comment): void;
}
