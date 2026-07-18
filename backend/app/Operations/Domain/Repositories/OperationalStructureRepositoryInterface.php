<?php

namespace App\Operations\Domain\Repositories;

use App\Operations\Application\DTOs\AssignOperatorTerritoryInputData;
use App\Operations\Application\DTOs\AssignSupervisorToZoneInputData;
use App\Operations\Application\DTOs\OperationalZoneSummaryData;
use App\Operations\Application\DTOs\OperatorProfileData;
use App\Operations\Application\DTOs\ReplaceZoneOperatorInputData;
use App\Operations\Application\DTOs\SupervisorProfileData;
use App\Operations\Application\DTOs\SyncSupervisorOperatorsInputData;
use App\Operations\Application\DTOs\UpdateOperatorProfileInputData;
use App\Operations\Application\DTOs\UpdateSupervisorProfileInputData;

interface OperationalStructureRepositoryInterface
{
    /**
     * @return array<int, OperationalZoneSummaryData>
     */
    public function zones(): array;

    /**
     * @return array<int, SupervisorProfileData>
     */
    public function supervisors(): array;

    /**
     * @return array<int, OperatorProfileData>
     */
    public function operators(): array;

    public function assignSupervisorToZone(AssignSupervisorToZoneInputData $data): OperationalZoneSummaryData;

    public function syncSupervisorOperators(SyncSupervisorOperatorsInputData $data): SupervisorProfileData;

    public function assignOperatorTerritory(AssignOperatorTerritoryInputData $data): OperatorProfileData;

    public function replaceZoneOperator(ReplaceZoneOperatorInputData $data): OperatorProfileData;

    public function updateSupervisorProfile(UpdateSupervisorProfileInputData $data): SupervisorProfileData;

    public function updateOperatorProfile(UpdateOperatorProfileInputData $data): OperatorProfileData;
}
