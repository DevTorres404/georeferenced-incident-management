<?php

namespace App\Auth\Infrastructure\Services;

use App\Auth\Application\Ports\PasswordHasherPort;
use Illuminate\Contracts\Hashing\Hasher;

final class LaravelPasswordHasherAdapter implements PasswordHasherPort
{
    public function __construct(private Hasher $hasher)
    {
    }

    public function verify(string $plainValue, ?string $hashedValue): bool
    {
        if ($hashedValue === null || $hashedValue === '') {
            return false;
        }

        return $this->hasher->check($plainValue, $hashedValue);
    }
}
