<?php

namespace App\Auth\Application\Ports;

interface TwoFactorAuthPort
{
    /**
     * Generates a new secret key for 2FA.
     */
    public function generateSecretKey(): string;

    /**
     * Generates the QR Code URL for the authenticator app.
     */
    public function getQRCodeUrl(string $companyName, string $companyEmail, string $secret): string;

    /**
     * Verifies if the provided code is valid for the given secret.
     */
    public function verifyKey(string $secret, string $code): bool;
}
