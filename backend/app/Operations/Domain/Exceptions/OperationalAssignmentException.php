<?php

namespace App\Operations\Domain\Exceptions;

use Exception;

final class OperationalAssignmentException extends Exception
{
    public static function supervisorRoleRequired(): self
    {
        return new self('El usuario seleccionado no tiene rol de supervisor.', 422);
    }

    public static function operatorRoleRequired(): self
    {
        return new self('El usuario seleccionado no tiene rol de operador.', 422);
    }

    public static function operationalZoneRequired(): self
    {
        return new self('La unidad territorial seleccionada no es una zona operativa valida.', 422);
    }

    public static function territoryRequired(): self
    {
        return new self('La unidad territorial seleccionada no es valida para una asignacion operativa.', 422);
    }

    public static function supervisorLimitExceeded(): self
    {
        return new self('El supervisor ya alcanzo su limite de operadores activos.', 422);
    }

    public static function supervisorLimitTooLow(): self
    {
        return new self('El nuevo limite no puede ser menor al total de operadores activos asignados.', 422);
    }

    public static function operatorZoneMismatch(): self
    {
        return new self('El operador no pertenece a la misma zona operativa del supervisor.', 422);
    }

    public static function supervisorZoneRequired(): self
    {
        return new self('El supervisor debe tener una zona operativa activa asignada.', 422);
    }
}
