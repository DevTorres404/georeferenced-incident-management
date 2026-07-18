<?php

namespace Tests\Unit\UseCases;

use App\Catalogs\Application\DTOs\CatalogPaginationFiltersData;
use App\Catalogs\Application\UseCases\CatalogManagementUseCase;
use App\Catalogs\Domain\Repositories\CatalogRepositoryInterface;
use App\Shared\Application\Results\PaginatedResult;
use Mockery;
use PHPUnit\Framework\TestCase;

class CatalogManagementUseCaseTest extends TestCase
{
    private CatalogRepositoryInterface $repository;

    private CatalogManagementUseCase $useCase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repository = Mockery::mock(CatalogRepositoryInterface::class);
        $this->useCase = new CatalogManagementUseCase($this->repository);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_paginate_delegates_to_repository(): void
    {
        $catalog = 'categories';
        $filters = new CatalogPaginationFiltersData(perPage: 15, isActive: true);

        $paginatedResult = new PaginatedResult(
            items: [],
            currentPage: 1,
            perPage: 15,
            total: 0,
            lastPage: 1
        );

        $this->repository->shouldReceive('paginate')
            ->with($catalog, $filters)
            ->once()
            ->andReturn($paginatedResult);

        $result = $this->useCase->paginate($catalog, $filters);

        $this->assertSame($paginatedResult, $result);
    }

    public function test_create_delegates_to_repository(): void
    {
        $catalog = 'categories';
        $data = ['name' => 'New Category'];
        $createdRecord = ['id' => 1, 'name' => 'New Category'];

        $this->repository->shouldReceive('create')
            ->with($catalog, $data)
            ->once()
            ->andReturn($createdRecord);

        $result = $this->useCase->create($catalog, $data);

        $this->assertSame($createdRecord, $result);
    }
}
