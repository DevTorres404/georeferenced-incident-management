<?php

namespace App\Auth\Domain\Services;

interface GoogleTokenVerifierInterface
{
    public function verify(string $idToken): array;
}
