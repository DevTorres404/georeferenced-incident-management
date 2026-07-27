<?php

declare(strict_types=1);

namespace Tests\Unit\Domain\Operations;

use App\Operations\Domain\Exceptions\OperationalAssignmentException;
use App\Operations\Domain\Services\OperatorCapacityPolicy;
use App\Operations\Domain\ValueObjects\OperatorCapacity;
use App\Operations\Domain\ValueObjects\OperatorWorkload;
use PHPUnit\Framework\TestCase;

final class OperatorCapacityPolicyTest extends TestCase
{
    private OperatorCapacityPolicy $policy;

    protected function setUp(): void
    {
        parent::setUp();
        $this->policy = new OperatorCapacityPolicy;
    }

    public function test_accepts_workload_that_reaches_both_limits_exactly(): void
    {
        $this->policy->ensureCanReceive(
            current: new OperatorWorkload(activeIncidents: 3, workloadPoints: 6),
            incoming: new OperatorWorkload(activeIncidents: 2, workloadPoints: 4),
            capacity: new OperatorCapacity(maxActiveIncidents: 5, maxWorkloadPoints: 10)
        );

        $this->addToAssertionCount(1);
    }

    public function test_rejects_workload_that_exceeds_the_active_incident_limit(): void
    {
        $this->expectException(OperationalAssignmentException::class);
        $this->expectExceptionCode(422);

        $this->policy->ensureCanReceive(
            current: new OperatorWorkload(activeIncidents: 4, workloadPoints: 3),
            incoming: new OperatorWorkload(activeIncidents: 2, workloadPoints: 2),
            capacity: new OperatorCapacity(maxActiveIncidents: 5, maxWorkloadPoints: 10)
        );
    }

    public function test_rejects_workload_that_exceeds_the_workload_points_limit(): void
    {
        $this->expectException(OperationalAssignmentException::class);
        $this->expectExceptionCode(422);

        $this->policy->ensureCanReceive(
            current: OperatorWorkload::empty(),
            incoming: new OperatorWorkload(activeIncidents: 2, workloadPoints: 11),
            capacity: new OperatorCapacity(maxActiveIncidents: 5, maxWorkloadPoints: 10)
        );
    }
}
