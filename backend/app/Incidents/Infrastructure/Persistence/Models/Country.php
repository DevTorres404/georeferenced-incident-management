<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * País — Primer nivel de la jerarquía geográfica.
 */
#[Fillable(['name', 'iso_code', 'is_active'])]
class Country extends Model
{
    protected $table = 'core.countries';

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function provinces(): HasMany
    {
        return $this->hasMany(Province::class);
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

