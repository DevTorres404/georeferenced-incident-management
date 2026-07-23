<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'incident_id',
    'previous_category_id',
    'previous_subcategory_id',
    'new_category_id',
    'new_subcategory_id',
    'changed_by',
    'reason',
])]
class IncidentClassificationHistory extends Model
{
    public $timestamps = false;

    protected $table = 'core.incident_classification_history';

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class);
    }

    public function changedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
