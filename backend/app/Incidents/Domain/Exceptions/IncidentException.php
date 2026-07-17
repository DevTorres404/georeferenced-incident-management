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

    public static function stateChangeRequestPending(): self
    {
        return new self('Ya existe una solicitud de cambio de estado pendiente para esta incidencia.', 422);
    }

    public static function stateChangeRequestInvalidSourceState(): self
    {
        return new self('Solo se puede solicitar la resolucion de una incidencia en progreso.', 422);
    }

    public static function stateChangeRequestInvalidTargetState(): self
    {
        return new self('Los operadores solo pueden solicitar el estado RESUELTA.', 422);
    }

    public static function stateChangeRequestRequiresActiveAssignment(): self
    {
        return new self('Debes tener una asignacion activa en la incidencia para solicitar su resolucion.', 403);
    }

    public static function stateChangeRequestNotFound(): self
    {
        return new self('La solicitud de cambio de estado no existe.', 404);
    }

    public static function stateChangeRequestAlreadyReviewed(): self
    {
        return new self('Esta solicitud de cambio de estado ya fue revisada.', 422);
    }

    public static function stateChangeRequestForbidden(): self
    {
        return new self('No tienes permisos para revisar esta solicitud de cambio de estado.', 403);
    }

    public static function operatorCannotChangeState(): self
    {
        return new self('Los operadores no pueden cambiar el estado directamente. Deben solicitar el cambio a un supervisor.', 403);
    }

    public static function closedIncidentAssignmentNotAllowed(): self
    {
        return new self('No se pueden asignar operadores a una incidencia cerrada.', 422);
    }

    public static function inProgressRequiredForAssignment(): self
    {
        return new self('Solo se pueden asignar operadores a incidencias en estado EN_PROGRESO.', 422);
    }
}
