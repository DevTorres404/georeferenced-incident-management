<?php

namespace App\Incidents\Domain\Exceptions;

use Exception;

class IncidentException extends Exception
{
    public static function editNotAllowed(): self
    {
        return new self('La incident ya no permite edicion en su estado actual.', 422);
    }

    public static function transitionNotAllowed(): self
    {
        return new self('La transicion de estado no esta permitida.', 422);
    }

    public static function transitionForbidden(): self
    {
        return new self('Tu rol no puede ejecutar esta transicion.', 403);
    }

    public static function transitionRequiresComment(): self
    {
        return new self('Esta transicion requiere comment.', 422);
    }

    public static function operatorAssignmentUnavailable(): self
    {
        return new self('El operador seleccionado no esta disponible para nuevas asignaciones.', 422);
    }

    public static function operatorCapacityExceeded(): self
    {
        return new self('El operador ya alcanzo su capacidad maxima de incidencias activas o puntos de carga.', 422);
    }

    public static function assignmentForbidden(): self
    {
        return new self('No tienes permisos para gestionar esta asignacion.', 403);
    }

    public static function supervisorZoneAccessDenied(): self
    {
        return new self('La incidencia no pertenece a una zona operativa asignada al supervisor.', 403);
    }

    public static function priorityRequiredForState(): self
    {
        return new self('Debes asignar una prioridad a la incidencia antes de cambiar su estado.', 422);
    }

    public static function priorityRequiredForAssignment(): self
    {
        return new self('La incidencia debe tener una prioridad asignada antes de asignar un operador.', 422);
    }

    public static function stateRequiredForAssignment(): self
    {
        return new self('La incidencia debe tener un estado asignado antes de asignar un operador.', 422);
    }
}
