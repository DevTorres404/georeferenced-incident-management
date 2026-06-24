<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * City/Municipio — Tercer nivel de la jerarquía geográfica.
 */
#[Fillable(['province_id', 'name', 'is_active'])]
class City extends Model
{
    protected $table = 'core.cities';

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function provincia(): BelongsTo
    {
        return $this->belongsTo(Province::class, 'province_id');
    }

    public function province(): BelongsTo
    {
        return $this->provincia();
    }

    public function incidents(): HasMany
    {
        return $this->hasMany(Incident::class);
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

