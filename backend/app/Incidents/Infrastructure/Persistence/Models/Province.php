<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Province/Departamento — Segundo nivel de la jerarquía geográfica.
 */
#[Fillable(['country_id', 'name', 'is_active'])]
class Province extends Model
{
    protected $table = 'core.provinces';

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function pais(): BelongsTo
    {
        return $this->belongsTo(Country::class, 'country_id');
    }

    public function country(): BelongsTo
    {
        return $this->pais();
    }

    public function cities(): HasMany
    {
        return $this->hasMany(City::class);
    }

    public function scopeActivos($query)
    {
        return $query->where('is_active', true);
    }

    public function scopeActive($query)
    {
        return $this->scopeActivos($query);
    }
}

