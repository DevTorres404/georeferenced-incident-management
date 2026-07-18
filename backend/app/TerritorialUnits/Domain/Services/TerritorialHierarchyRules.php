<?php

namespace App\TerritorialUnits\Domain\Services;

use App\TerritorialUnits\Domain\ValueObjects\TerritorialUnitType;
use DomainException;

final class TerritorialHierarchyRules
{
    /**
     * @param  array<int, int>  $parentAncestorIds
     */
    public function validate(
        string $type,
        ?string $parentType,
        ?int $parentId = null,
        array $parentAncestorIds = [],
        ?int $currentId = null
    ): void {
        if (! TerritorialUnitType::isValid($type)) {
            throw new DomainException('El tipo territorial no es valido.');
        }

        $expectedParentType = TerritorialUnitType::expectedParentType($type);

        if ($expectedParentType === null && $parentType !== null) {
            throw new DomainException('La unidad territorial seleccionada no debe tener unidad padre.');
        }

        if ($expectedParentType !== null && $parentType === null) {
            throw new DomainException('La unidad territorial requiere una unidad padre valida.');
        }

        if ($parentType !== null && $parentType !== $expectedParentType) {
            throw new DomainException('La jerarquia territorial seleccionada no es valida.');
        }

        if ($parentId !== null && $currentId !== null && $parentId === $currentId) {
            throw new DomainException('Una unidad territorial no puede ser padre de si misma.');
        }

        if ($currentId !== null && in_array($currentId, $parentAncestorIds, true)) {
            throw new DomainException('La relacion territorial genera un ciclo.');
        }
    }
}
