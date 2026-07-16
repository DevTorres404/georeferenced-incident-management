<?php

namespace Tests\Unit\UseCases;

use App\Incidents\Application\UseCases\NotificationUseCase;
use App\Incidents\Domain\Repositories\IncidentRepositoryInterface;
use Mockery;
use PHPUnit\Framework\TestCase;

class NotificationUseCaseTest extends TestCase
{
    private IncidentRepositoryInterface $repository;
    private NotificationUseCase $useCase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repository = Mockery::mock(IncidentRepositoryInterface::class);
        $this->useCase = new NotificationUseCase($this->repository);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_mark_all_as_read_delegates_to_repository(): void
    {
        $userId = 1;

        $this->repository->shouldReceive('markAllAsRead')
            ->with($userId)
            ->once();

        $this->useCase->markAllAsRead($userId);

        // Si llegó hasta aquí sin lanzar excepción de Mockery, el test pasa.
        $this->assertTrue(true);
    }
}
