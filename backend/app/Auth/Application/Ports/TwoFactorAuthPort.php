<?php

namespace App\Auth\Application\Ports;

interface TwoFactorAuthPort
{
    /**
     * Generates a new secret key for 2FA.
     *
     * @return string
     */
    public function generateSecretKey(): string;

    /**
     * Generates the QR Code URL for the authenticator app.
     *
     * @param string $companyName
     * @param string $companyEmail
     * @param string $secret
     * @return string
     */
    public function getQRCodeUrl(string $companyName, string $companyEmail, string $secret): string;

    /**
     * Verifies if the provided code is valid for the given secret.
     *
     * @param string $secret
     * @param string $code
     * @return bool
     */
    public function verifyKey(string $secret, string $code): bool;
}
