<?php

namespace App\Auth\Infrastructure\Services;

use App\Auth\Application\Ports\TwoFactorAuthPort;
use PragmaRX\Google2FA\Google2FA;

final class GoogleTwoFactorAuthAdapter implements TwoFactorAuthPort
{
    private Google2FA $google2fa;

    public function __construct()
    {
        $this->google2fa = new Google2FA();
    }

    public function generateSecretKey(): string
    {
        return $this->google2fa->generateSecretKey();
    }

    public function getQRCodeUrl(string $companyName, string $companyEmail, string $secret): string
    {
        return $this->google2fa->getQRCodeUrl(
            $companyName,
            $companyEmail,
            $secret
        );
    }

    public function verifyKey(string $secret, string $code): bool
    {
        return $this->google2fa->verifyKey($secret, $code);
    }
}
