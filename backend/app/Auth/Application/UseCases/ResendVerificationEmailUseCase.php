<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\Ports\UserNotificationPort;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class ResendVerificationEmailUseCase
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private UserNotificationPort $notificationPort
    ) {
    }

    public function execute(int $userId): void
    {
        $user = $this->userRepository->findById($userId);

        if (! $user) {
            throw AuthException::userNotFound();
        }

        if ($user->hasVerifiedEmail()) {
            return;
        }

        $this->notificationPort->sendVerificationEmail($userId);
    }
}
