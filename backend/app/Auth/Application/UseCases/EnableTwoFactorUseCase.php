<?php

namespace App\Auth\Application\UseCases;

use App\Auth\Application\Ports\TwoFactorAuthPort;
use App\Auth\Domain\Exceptions\AuthException;
use App\Auth\Domain\Repositories\UserRepositoryInterface;

final class EnableTwoFactorUseCase
{
    public function __construct(
        private UserRepositoryInterface $userRepository,
        private TwoFactorAuthPort $twoFactorAuth
    ) {}

    /**
     * @return array{secret: string, qr_url: string}
     */
    public function execute(int $userId): array
    {
        $user = $this->userRepository->findById($userId);

        if (! $user) {
            throw AuthException::userNotFound();
        }

        if ($user->isTwoFactorEnabled()) {
            throw new \DomainException('La autenticación de dos factores ya está habilitada.');
        }

        $secret = $this->twoFactorAuth->generateSecretKey();

        $this->userRepository->updateTwoFactorSecret($userId, $secret);

        $qrUrl = $this->twoFactorAuth->getQRCodeUrl(
            config('app.name', 'App'),
            $user->email,
            $secret
        );

        return [
            'secret' => $secret,
            'qr_url' => $qrUrl,
        ];
    }
}
