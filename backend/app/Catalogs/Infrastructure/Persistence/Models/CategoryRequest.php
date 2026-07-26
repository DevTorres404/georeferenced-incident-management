<?php

declare(strict_types=1);

namespace App\Catalogs\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CategoryRequest extends Model
{
    protected $table = 'core.category_requests';

    protected $fillable = [
        'incident_id',
        'requested_by',
        'suggested_name',
        'suggested_category_description',
        'suggested_subcategory_name',
        'suggested_icon',
        'reason',
        'status',
        'resolved_by',
        'created_category_id',
        'created_subcategory_id',
        'admin_comment',
        'resolved_at',
    ];

    protected $casts = [
        'resolved_at' => 'datetime',
    ];

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class, 'incident_id');
    }

    public function requestedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function resolvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
