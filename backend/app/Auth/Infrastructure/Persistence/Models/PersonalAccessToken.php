<?php

namespace App\Auth\Infrastructure\Persistence\Models;

use Laravel\Sanctum\PersonalAccessToken as SanctumToken;

/**
 * Modelo de token personalizado de Sanctum.
 * Mapeado explícitamente a la tabla 'auth.personal_access_tokens'
 * para compatibilidad con la arquitectura modular de esquemas.
 */
class PersonalAccessToken extends SanctumToken
{
    protected $table = 'auth.personal_access_tokens';
}

