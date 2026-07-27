<?php

declare(strict_types=1);

namespace App\Operations\Domain\Services;

use App\Operations\Domain\Exceptions\OperationalAssignmentException;
use App\Operations\Domain\ValueObjects\OperatorCapacity;
use App\Operations\Domain\ValueObjects\OperatorWorkload;

final class OperatorCapacityPolicy
{
    public function ensureCanReceive(
        OperatorWorkload $current,
        OperatorWorkload $incoming,
        OperatorCapacity $capacity
    ): void {
        if (! $capacity->supports($current->plus($incoming))) {
            throw OperationalAssignmentException::operatorCapacityExceeded();
        }
    }
}
