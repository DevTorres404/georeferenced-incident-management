<?php

namespace Tests\Unit\UseCases;

use App\Auth\Domain\Entities\AuthUser;
use App\Users\Application\DTOs\CreateManagedUserInputData;
use App\Users\Application\UseCases\UserManagementUseCase;
use App\Users\Domain\Repositories\UserRepositoryInterface;
use Mockery;
use PHPUnit\Framework\TestCase;

class UserManagementUseCaseTest extends TestCase
{
    private UserRepositoryInterface $repository;

    private UserManagementUseCase $useCase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->repository = Mockery::mock(UserRepositoryInterface::class);
        $this->useCase = new UserManagementUseCase($this->repository);
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_create_user_delegates_to_repository(): void
    {
        $data = new CreateManagedUserInputData(
            firstName: 'John',
            lastName: 'Doe',
            username: 'johndoe',
            email: 'john@example.com',
            password: 'password',
            phone: null,
            profilePhoto: null
        );

        $authUser = new AuthUser(
            id: 1,
            firstName: 'John',
            lastName: 'Doe',
            username: 'johndoe',
            email: 'john@example.com',
            passwordHash: 'hash',
            phone: null,
            profilePhoto: null,
            isActive: true,
            emailVerifiedAt: null,
            lastAccessAt: null
        );

        $this->repository->shouldReceive('create')
            ->with($data)
            ->once()
            ->andReturn($authUser);

        $result = $this->useCase->create($data);

        $this->assertSame($authUser, $result);
    }

    public function test_reset_two_factor_delegates_to_repository(): void
    {
        $authUser = new AuthUser(
            id: 2,
            firstName: 'Jane',
            lastName: 'Doe',
            username: 'janedoe',
            email: 'jane@example.com',
            passwordHash: 'hash',
            phone: null,
            profilePhoto: null,
            isActive: true,
            emailVerifiedAt: null,
            lastAccessAt: null
        );

        $this->repository->shouldReceive('resetTwoFactor')
            ->with(2, 1)
            ->once()
            ->andReturn($authUser);

        $this->assertSame($authUser, $this->useCase->resetTwoFactor(2, 1));
    }
}
