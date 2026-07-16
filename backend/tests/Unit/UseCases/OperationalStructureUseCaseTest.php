<?php

namespace Tests\Unit\UseCases;

use App\Operations\Application\DTOs\AssignOperatorTerritoryInputData;
use App\Operations\Application\DTOs\AssignSupervisorToZoneInputData;
use App\Operations\Application\DTOs\OperationalZoneSummaryData;
use App\Operations\Application\DTOs\OperatorProfileData;
use App\Operations\Application\DTOs\ReplaceZoneOperatorInputData;
use App\Operations\Application\UseCases\OperationalStructureUseCase;
use App\Operations\Domain\Repositories\OperationalStructureRepositoryInterface;
use Mockery;
use PHPUnit\Framework\TestCase;

class OperationalStructureUseCaseTest extends TestCase
{
    private OperationalStructureRepositoryInterface $repository;
    private OperationalStructureUseCase $useCase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repository = Mockery::mock(OperationalStructureRepositoryInterface::class);
        $this->useCase = new OperationalStructureUseCase($this->repository);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_assign_supervisor_to_zone_delegates_to_repository(): void
    {
        $data = new AssignSupervisorToZoneInputData(
            zoneId: 1,
            supervisorUserId: 2,
            assignedByUserId: 3
        );
        
        $zoneData = new \App\Operations\Application\DTOs\OperationalTerritoryData(1, 'Zone', 'ZONE', null, 'Zone');
        $userData = new \App\Operations\Application\DTOs\OperationalUserData(2, 'Name', 'Last', 'e@m.com', 'SUPERVISOR');
        
        $summary = new \App\Operations\Application\DTOs\OperationalZoneSummaryData(
            zone: $zoneData,
            supervisor: $userData,
            maxOperators: 10,
            activeOperatorsCount: 5,
            activeIncidents: 0,
            averageWorkloadPoints: 0.0,
            provincesCovered: []
        );
        
        $this->repository->shouldReceive('assignSupervisorToZone')
            ->with($data)
            ->once()
            ->andReturn($summary);

        $result = $this->useCase->assignSupervisorToZone($data);

        $this->assertSame($summary, $result);
    }

    public function test_replace_zone_operator_delegates_to_repository(): void
    {
        $data = new ReplaceZoneOperatorInputData(
            currentOperatorUserId: 1,
            replacementOperatorUserId: 2,
            assignedByUserId: 3
        );
        
        $userData = new \App\Operations\Application\DTOs\OperationalUserData(2, 'Name', 'Last', 'e@m.com', 'OPERATOR');
        
        $operatorProfile = new \App\Operations\Application\DTOs\OperatorProfileData(
            operator: $userData,
            maxActiveIncidents: 5,
            maxWorkloadPoints: 10,
            active: true
        );

        $this->repository->shouldReceive('replaceZoneOperator')
            ->with($data)
            ->once()
            ->andReturn($operatorProfile);

        $result = $this->useCase->replaceZoneOperator($data);

        $this->assertSame($operatorProfile, $result);
    }

    public function test_assign_operator_territory_delegates_to_repository(): void
    {
        $data = new AssignOperatorTerritoryInputData(
            operatorUserId: 1,
            territorialUnitId: 2,
            assignedByUserId: 3
        );
        
        $userData = new \App\Operations\Application\DTOs\OperationalUserData(2, 'Name', 'Last', 'e@m.com', 'OPERATOR');
        
        $operatorProfile = new \App\Operations\Application\DTOs\OperatorProfileData(
            operator: $userData,
            maxActiveIncidents: 5,
            maxWorkloadPoints: 10,
            active: true
        );

        $this->repository->shouldReceive('assignOperatorTerritory')
            ->with($data)
            ->once()
            ->andReturn($operatorProfile);

        $result = $this->useCase->assignOperatorTerritory($data);

        $this->assertSame($operatorProfile, $result);
    }
}
