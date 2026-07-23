<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use App\Shared\Infrastructure\Persistence\Concerns\Auditable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;

/**
 * Configuración del sistema (patrón EAV tipado).
 *
 * Almacena parámetros globales como pares clave-valor con tipo.
 * Ejemplos: app.nombre, incident.codigo_prefijo, etc.
 */
#[Fillable(['key', 'value', 'type', 'description'])]
class Configuration extends Model
{
    use Auditable;

    protected $table = 'core.settings';

    /**
     * @return array<int, string>
     */
    public function auditExcludedAttributes(): array
    {
        $sensitiveKey = preg_match(
            '/(?:password|secret|token|credential|api[_-]?key)/i',
            (string) $this->key
        ) === 1;

        return $sensitiveKey ? ['value'] : [];
    }

    public function getTypedValueAttribute(): mixed
    {
        return match ($this->type) {
            'integer' => (int) $this->value,
            'boolean' => filter_var($this->value, FILTER_VALIDATE_BOOLEAN),
            'json' => json_decode($this->value, true),
            default => $this->value,
        };
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        $config = static::where('key', $key)->first();

        return $config ? $config->typed_value : $default;
    }
}
