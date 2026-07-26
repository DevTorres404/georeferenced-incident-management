<?php

declare(strict_types=1);

namespace App\Catalogs\Domain\Exceptions;

use Exception;

final class CategoryRequestException extends Exception
{
    public static function incidentDoesNotRequireClassification(): self
    {
        return new self('La incidencia ya tiene una clasificación definitiva.', 422);
    }

    public static function pendingRequestAlreadyExists(): self
    {
        return new self('Ya existe una solicitud de categoría pendiente para esta incidencia.', 422);
    }

    public static function notFound(): self
    {
        return new self('La solicitud de categoría no existe.', 404);
    }

    public static function alreadyReviewed(): self
    {
        return new self('La solicitud de categoría ya fue procesada.', 422);
    }
}
