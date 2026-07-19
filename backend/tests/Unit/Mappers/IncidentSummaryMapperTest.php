<?php

namespace Tests\Unit\Mappers;

use App\Incidents\Infrastructure\Persistence\Mappers\IncidentSummaryMapper;
use App\Incidents\Infrastructure\Persistence\Mappers\StateSummaryMapper;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use PHPUnit\Framework\TestCase;

class IncidentSummaryMapperTest extends TestCase
{
    public function test_it_maps_incident_with_priority_color()
    {
        // Arrange
        $stateMapper = new StateSummaryMapper();
        $mapper = new IncidentSummaryMapper($stateMapper);
        
        $priority = new Priority();
        $priority->id = 3;
        $priority->name = 'Baja';
        $priority->level = 1;
        $priority->color = '#00FF00';

        $state = new State();
        $state->id = 1;
        $state->name = 'NUEVA';
        $state->is_final_state = false;
        $state->allows_edition = true;
        
        $incident = new Incident();
        $incident->id = 100;
        $incident->title = 'Test incident';
        $incident->description = 'Test desc';
        $incident->reporter_user_id = 1;
        $incident->state_id = 1;
        $incident->setRelation('priority', $priority);
        $incident->setRelation('state', $state);
        
        // Act
        $dto = $mapper->fromModel($incident);
        
        // Assert
        $this->assertNotNull($dto->priority);
        $this->assertEquals(3, $dto->priority->id);
        $this->assertEquals('#00FF00', $dto->priority->color);
        $this->assertNull($dto->zoneName);
    }
}
