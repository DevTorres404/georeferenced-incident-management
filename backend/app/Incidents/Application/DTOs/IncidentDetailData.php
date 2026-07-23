<?php

namespace App\Incidents\Application\DTOs;

use JsonSerializable;

final class IncidentDetailData implements JsonSerializable
{
    /**
     * @param  array<int, IncidentHistoryEntryData>  $history
     * @param  array<int, CommentData>  $comments
     * @param  array<int, AttachmentData>  $attachments
     * @param  array<int, AssignmentData>  $assignments
     */
    public function __construct(
        public readonly int $id,
        public readonly ?string $code,
        public readonly string $title,
        public readonly string $description,
        public readonly ?string $address,
        public readonly ?string $latitude,
        public readonly ?string $longitude,
        public readonly ?string $dueDate,
        public readonly ?string $resolutionDate,
        public readonly ?string $reopenedAt,
        public readonly ?string $previousResolutionDate,
        public readonly ?string $rejectedAt,
        public readonly ?string $createdAt,
        public readonly int $reporterUserId,
        public readonly ?int $assigneeUserId,
        public readonly int $stateId,
        public readonly ?StateSummaryData $state,
        public readonly ?CategorySummaryData $category,
        public readonly ?CategorySummaryData $subcategory,
        public readonly ?PrioritySummaryData $priority,
        public readonly string $classificationStatus = 'CLASSIFIED',
        public readonly ?string $classificationDetail = null,
        public readonly ?array $classifiedBy = null,
        public readonly ?string $classifiedAt = null,
        public readonly ?TerritorialUnitSummaryData $territorialUnit = null,
        public readonly ?array $reporter = null,
        public readonly ?array $assignedOperator = null,
        public readonly ?array $sla = null,
        public readonly array $history = [],
        public readonly array $comments = [],
        public readonly array $attachments = [],
        public readonly array $assignments = [],
        public readonly array $cycles = []
    ) {}

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
            'reopened_at' => $this->reopenedAt,
            'previous_resolution_date' => $this->previousResolutionDate,
            'rejected_at' => $this->rejectedAt,
            'assigned_operator' => $this->assignedOperator,
            'created_at' => $this->createdAt,
            'reporter_user_id' => $this->reporterUserId,
            'assignee_user_id' => $this->assigneeUserId,
            'state_id' => $this->stateId,
            'state' => $this->state,
            'category' => $this->category,
            'subcategory' => $this->subcategory,
            'priority' => $this->priority,
            'classification_status' => $this->classificationStatus,
            'classification_detail' => $this->classificationDetail,
            'classified_by' => $this->classifiedBy,
            'classified_at' => $this->classifiedAt,
            'territorial_unit' => $this->territorialUnit,
            'reporter' => $this->reporter,
            'sla' => $this->sla,
            'history' => $this->history,
            'comments' => $this->comments,
            'attachments' => $this->attachments,
            'assignments' => $this->assignments,
            'cycles' => $this->cycles,
        ];
    }
}
