<?php

namespace App\Operations\Application\UseCases;

use App\Operations\Application\DTOs\AssignOperatorTerritoryInputData;
use App\Operations\Application\DTOs\AssignSupervisorToZoneInputData;
use App\Operations\Application\DTOs\OperationalZoneSummaryData;
use App\Operations\Application\DTOs\OperatorProfileData;
use App\Operations\Application\DTOs\ReleaseSupervisorFromZoneInputData;
use App\Operations\Application\DTOs\ReplaceZoneOperatorInputData;
use App\Operations\Application\DTOs\SupervisorProfileData;
use App\Operations\Application\DTOs\SyncSupervisorOperatorsInputData;
use App\Operations\Application\DTOs\UpdateOperatorProfileInputData;
use App\Operations\Application\DTOs\UpdateSupervisorProfileInputData;
use App\Operations\Domain\Repositories\OperationalStructureRepositoryInterface;

final class OperationalStructureUseCase
{
    public function __construct(private OperationalStructureRepositoryInterface $operationalStructureRepository) {}

    /**
     * @return array<int, OperationalZoneSummaryData>
     */
    public function zones(): array
    {
        return $this->operationalStructureRepository->zones();
    }

    /**
     * @return array<int, SupervisorProfileData>
     */
    public function supervisors(): array
    {
        return $this->operationalStructureRepository->supervisors();
    }

    /**
     * @return array<int, OperatorProfileData>
     */
    public function operators(): array
    {
        return $this->operationalStructureRepository->operators();
    }

    public function assignSupervisorToZone(AssignSupervisorToZoneInputData $data): OperationalZoneSummaryData
    {
        return $this->operationalStructureRepository->assignSupervisorToZone($data);
    }

    public function releaseSupervisorFromZone(ReleaseSupervisorFromZoneInputData $data): OperationalZoneSummaryData
    {
        return $this->operationalStructureRepository->releaseSupervisorFromZone($data);
    }

    public function syncSupervisorOperators(SyncSupervisorOperatorsInputData $data): SupervisorProfileData
    {
        return $this->operationalStructureRepository->syncSupervisorOperators($data);
    }

    public function assignOperatorTerritory(AssignOperatorTerritoryInputData $data): OperatorProfileData
    {
        return $this->operationalStructureRepository->assignOperatorTerritory($data);
    }

    public function replaceZoneOperator(ReplaceZoneOperatorInputData $data): OperatorProfileData
    {
        return $this->operationalStructureRepository->replaceZoneOperator($data);
    }

    public function updateSupervisorProfile(UpdateSupervisorProfileInputData $data): SupervisorProfileData
    {
        return $this->operationalStructureRepository->updateSupervisorProfile($data);
    }

    public function updateOperatorProfile(UpdateOperatorProfileInputData $data): OperatorProfileData
    {
        return $this->operationalStructureRepository->updateOperatorProfile($data);
    }
}
