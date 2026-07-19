<?php

namespace Tests\Unit\DTOs;

use PHPUnit\Framework\TestCase;
use App\Incidents\Application\DTOs\PrioritySummaryData;

class PrioritySummaryDataTest extends TestCase
{
    public function test_it_serializes_with_color()
    {
        $dto = new PrioritySummaryData(1, 'Alta', 2, '#FF0000');

        $result = $dto->jsonSerialize();

        $this->assertEquals([
            'id' => 1,
            'name' => 'Alta',
            'level' => 2,
            'color' => '#FF0000',
        ], $result);
    }

    public function test_it_serializes_without_color()
    {
        $dto = new PrioritySummaryData(2, 'Media', 1);

        $result = $dto->jsonSerialize();

        $this->assertEquals([
            'id' => 2,
            'name' => 'Media',
            'level' => 1,
            'color' => null,
        ], $result);
    }
}
