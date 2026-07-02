<?php

namespace App\Auth\Infrastructure\Services;

use App\Auth\Domain\Services\GoogleTokenVerifierInterface;

class FirebaseGoogleTokenVerifier implements GoogleTokenVerifierInterface
{
    private const DEFAULT_TOKEN_LEEWAY_SECONDS = 120;

    public function verify(string $idToken): array
    {
        $verifiedIdToken = app('firebase.auth')->verifyIdToken(
            $idToken,
            false,
            (int) config('firebase.token_leeway_seconds', self::DEFAULT_TOKEN_LEEWAY_SECONDS)
        );
        $claims = $verifiedIdToken->claims();

        return [
            'sub' => (string) $claims->get('sub'),
            'email' => $claims->get('email'),
            'email_verified' => $claims->get('email_verified'),
            'name' => $claims->get('name'),
            'given_name' => $claims->get('given_name'),
            'family_name' => $claims->get('family_name'),
            'picture' => $claims->get('picture'),
        ];
    }
}
