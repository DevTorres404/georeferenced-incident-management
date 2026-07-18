<?php

namespace App\TerritorialUnits\Infrastructure\Persistence\Models;

use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Shared\Infrastructure\Persistence\Concerns\Auditable;
use App\TerritorialUnits\Domain\ValueObjects\TerritorialUnitType;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'name',
    'type',
    'parent_id',
    'code',
    'is_active',
])]
class TerritorialUnit extends Model
{
    use Auditable;

    public const TYPE_COUNTRY = TerritorialUnitType::COUNTRY;

    public const TYPE_OPERATIONAL_ZONE = TerritorialUnitType::OPERATIONAL_ZONE;

    public const TYPE_PROVINCE = TerritorialUnitType::PROVINCE;

    public const TYPE_CANTON = TerritorialUnitType::CANTON;

    public const TYPE_PARISH = TerritorialUnitType::PARISH;

    public const TYPE_SECTOR = TerritorialUnitType::SECTOR;

    public const TYPES = TerritorialUnitType::ALL;

    public const PARENT_CHAIN = 'parent.parent.parent.parent.parent';

    protected $table = 'core.territorial_units';

    protected $appends = ['full_path'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('name');
    }

    public function activeChildren(): HasMany
    {
        return $this->children()->where('is_active', true);
    }

    public function incidents(): HasMany
    {
        return $this->hasMany(Incident::class, 'territorial_unit_id');
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function isProvince(): bool
    {
        return $this->type === self::TYPE_PROVINCE;
    }

    public function isCountry(): bool
    {
        return $this->type === self::TYPE_COUNTRY;
    }

    public function isOperationalZone(): bool
    {
        return $this->type === self::TYPE_OPERATIONAL_ZONE;
    }

    public function isCanton(): bool
    {
        return $this->type === self::TYPE_CANTON;
    }

    public function isParish(): bool
    {
        return $this->type === self::TYPE_PARISH;
    }

    public function isSector(): bool
    {
        return $this->type === self::TYPE_SECTOR;
    }

    public function getFullPathAttribute(): string
    {
        $segments = [$this->name];
        $parent = $this->relationLoaded('parent') ? $this->parent : null;

        while ($parent) {
            array_unshift($segments, $parent->name);
            $parent = $parent->relationLoaded('parent') ? $parent->parent : null;
        }

        return implode(' / ', $segments);
    }
}
