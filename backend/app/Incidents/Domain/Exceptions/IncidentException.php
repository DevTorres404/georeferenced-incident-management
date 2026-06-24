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
}
