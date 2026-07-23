<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use App\Shared\Infrastructure\Persistence\Concerns\Auditable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Categoría de incident — Primer nivel de clasificación.
 *
 * Ejemplos: Vialidad, Servicios Públicos, Seguridad, Medio Ambiente
 */
#[Fillable(['name', 'description', 'icon', 'color', 'is_active', 'is_fallback'])]
class Category extends Model
{
    use Auditable;

    protected $table = 'core.categories';

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'is_fallback' => 'boolean',
        ];
    }

    public function subcategories(): HasMany
    {
        return $this->hasMany(Subcategory::class);
    }

    public function incidents(): HasMany
    {
        return $this->hasMany(Incident::class);
    }

    public function scopeActivos($query)
    {
        return $query->where('is_active', true);
    }
}
