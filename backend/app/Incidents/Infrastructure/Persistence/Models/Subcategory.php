<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Subcategoría de incident — Segundo nivel de clasificación.
 *
 * Ejemplos para Vialidad: Bache, Semáforo dañado, Señalización
 */
#[Fillable(['category_id', 'name', 'description', 'is_active'])]
class Subcategory extends Model
{
    protected $table = 'core.subcategories';

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function categoria(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'category_id');
    }

    public function category(): BelongsTo
    {
        return $this->categoria();
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
