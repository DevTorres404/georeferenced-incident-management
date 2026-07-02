<?php

namespace App\Operations\Domain\Services;

use App\Operations\Domain\Exceptions\OperationalAssignmentException;

final class SupervisorCapacityPolicy
{
    public function ensureWithinLimit(int $requestedOperators, int $maxOperators): void
    {
        if ($requestedOperators > $maxOperators) {
            throw OperationalAssignmentException::supervisorLimitExceeded();
        }
    }

    public function ensureLimitNotBelowCurrent(int $currentOperators, int $newLimit): void
    {
        if ($newLimit < $currentOperators) {
            throw OperationalAssignmentException::supervisorLimitTooLow();
        }
    }
}
