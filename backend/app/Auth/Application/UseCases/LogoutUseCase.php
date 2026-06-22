<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\Ports\SessionManagerPort;

final class LogoutUseCase
{
    public function __construct(private SessionManagerPort $sessionManager)
    {
    }

    public function execute(int $tokenId): void
    {
        $this->sessionManager->revokeByTokenId($tokenId);
    }
}
