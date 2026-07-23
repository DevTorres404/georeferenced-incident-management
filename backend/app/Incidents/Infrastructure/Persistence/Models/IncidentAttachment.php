<?php

namespace App\Incidents\Infrastructure\Persistence\Models;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Shared\Infrastructure\Persistence\Concerns\Auditable;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Archivo adjunto de una incident.
 *
 * Tabla append-only: los adjuntos no se modifican una vez subidos.
 * Incluye hash SHA-256 para verificación de integridad.
 */
#[Fillable([
    'incident_id',
    'incident_cycle_id',
    'user_id',
    'original_name',
    'file_path',
    'mime_type',
    'file_size_bytes',
    'file_hash',
])]
class IncidentAttachment extends Model
{
    use Auditable;

    protected $table = 'core.incident_attachments';

    const UPDATED_AT = null;

    public $timestamps = true;

    protected function casts(): array
    {
        return [
            'file_size_bytes' => 'integer',
        ];
    }

    public function incident(): BelongsTo
    {
        return $this->belongsTo(Incident::class, 'incident_id');
    }

    public function usuario(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function user(): BelongsTo
    {
        return $this->usuario();
    }

    public function cycle(): BelongsTo
    {
        return $this->belongsTo(IncidentCycle::class, 'incident_cycle_id');
    }

    public function getTamanoFormateadoAttribute(): string
    {
        $bytes = $this->file_size_bytes;

        if ($bytes >= 1048576) {
            return round($bytes / 1048576, 2).' MB';
        }
        if ($bytes >= 1024) {
            return round($bytes / 1024, 2).' KB';
        }

        return $bytes.' B';
    }

    public function getFormattedSizeAttribute(): string
    {
        return $this->getTamanoFormateadoAttribute();
    }
}
