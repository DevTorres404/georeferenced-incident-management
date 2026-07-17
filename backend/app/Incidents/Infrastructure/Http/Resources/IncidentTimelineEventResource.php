<?php

namespace App\Incidents\Infrastructure\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class IncidentTimelineEventResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'type' => $this->type,
            'date' => $this->date?->toISOString(),
            'user' => $this->user ? [
                'id' => $this->user->id,
                'name' => $this->user->getNombreCompletoAttribute(),
            ] : null,
            'title' => $this->title,
            'description' => $this->description,
            'metadata' => $this->metadata,
            'cycle_id' => $this->cycle_id,
            'cycle_number' => $this->cycle_number,
        ];
    }
}
