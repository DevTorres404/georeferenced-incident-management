<?php

namespace App\Auth\Application\DTOs;

use App\Auth\Domain\Entities\AuthUser;
use JsonSerializable;

final class AuthActionResultData implements JsonSerializable
{
    public function __construct(
        public readonly string $message,
        public readonly AuthUser $user,
        public readonly ?SessionTokenData $session = null,
        public readonly ?bool $emailVerified = null,
        public readonly ?bool $verificationSent = null,
        public readonly ?string $verificationError = null
    ) {
    }

    public function jsonSerialize(): array
    {
        $payload = [
            'message' => $this->message,
            'user' => $this->user,
        ];

        if ($this->session) {
            $payload['access_token'] = $this->session->token;
            $payload['token_type'] = 'Bearer';
            $payload['expires_at'] = $this->session->expiresAt;
            $payload['expires_in'] = $this->session->expiresIn;
        }

        if ($this->emailVerified !== null) {
            $payload['email_verified'] = $this->emailVerified;
        }

        if ($this->verificationSent !== null) {
            $payload['verification_sent'] = $this->verificationSent;
        }

        if ($this->verificationError !== null) {
            $payload['verification_error'] = $this->verificationError;
        }

        return $payload;
    }
}
