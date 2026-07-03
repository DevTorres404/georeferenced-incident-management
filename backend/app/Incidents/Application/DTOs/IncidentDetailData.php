<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class IncidentDetailData implements JsonSerializable
{
    /**
     * @param array<int, IncidentHistoryEntryData> $history
     * @param array<int, CommentData> $comments
     * @param array<int, AttachmentData> $attachments
     * @param array<int, AssignmentData> $assignments
     */
    public function __construct(
        public readonly int $id,
        public readonly ?string $code,
        public readonly string $title,
        public readonly string $description,
        public readonly ?string $address,
        public readonly ?string $latitude,
        public readonly ?string $longitude,
        public readonly ?string $resolutionDate,
        public readonly ?string $createdAt,
        public readonly int $reporterUserId,
        public readonly ?int $assigneeUserId,
        public readonly int $stateId,
        public readonly ?StateSummaryData $state,
        public readonly ?CategorySummaryData $category,
        public readonly ?CategorySummaryData $subcategory,
            public readonly ?PrioritySummaryData $priority,
            public readonly ?TerritorialUnitSummaryData $territorialUnit = null,
            public readonly ?array $reporter = null,
            public readonly ?array $assignedOperator = null,
            public readonly ?array $sla = null,
            public readonly array $history = [],
            public readonly array $comments = [],
            public readonly array $attachments = [],
            public readonly array $assignments = []
        ) {
        }
    
        public function jsonSerialize(): array
        {
            return [
                'id' => $this->id,
                'code' => $this->code,
                'title' => $this->title,
                'description' => $this->description,
                'address' => $this->address,
                'address_reference' => $this->address,
                'latitude' => $this->latitude,
                'longitude' => $this->longitude,
                'resolution_date' => $this->resolutionDate,
                'created_at' => $this->createdAt,
                'reporter_user_id' => $this->reporterUserId,
                'assignee_user_id' => $this->assigneeUserId,
                'state_id' => $this->stateId,
                'state' => $this->state,
                'category' => $this->category,
                'subcategory' => $this->subcategory,
                'priority' => $this->priority,
                'territorial_unit' => $this->territorialUnit,
                'reporter' => $this->reporter,
                'assigned_operator' => $this->assignedOperator,
                'sla' => $this->sla,
                'history' => $this->history,
                'comments' => $this->comments,
                'attachments' => $this->attachments,
                'assignments' => $this->assignments,
            ];
        }
    }
