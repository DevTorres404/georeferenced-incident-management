<?php

namespace Tests\Unit\UseCases;

use App\Incidents\Application\DTOs\ChangeStateInputData;
use App\Incidents\Application\DTOs\UpdateIncidentInputData;
use App\Incidents\Application\UseCases\IncidentUseCase;
use App\Incidents\Domain\Entities\Incident;
use App\Incidents\Domain\Entities\IncidentState;
use App\Incidents\Domain\Entities\IncidentTransition;
use App\Incidents\Domain\Exceptions\IncidentException;
use App\Incidents\Domain\Repositories\IncidentRepositoryInterface;
use App\Shared\Application\DTOs\StoredFileData;
use App\Shared\Application\DTOs\UploadedFileData;
use App\Shared\Application\Ports\FileStoragePort;
use App\Shared\Application\Ports\TransactionManagerPort;
use Mockery;
use PHPUnit\Framework\TestCase;

class IncidentUseCaseTest extends TestCase
{
    private IncidentRepositoryInterface $incidentRepository;
    private FileStoragePort $fileStoragePort;
    private TransactionManagerPort $transactionManager;
    private IncidentUseCase $useCase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->incidentRepository = Mockery::mock(IncidentRepositoryInterface::class);
        $this->fileStoragePort = Mockery::mock(FileStoragePort::class);
        
        // Simular que el TransactionManager simplemente ejecuta el closure (sin ir a BD)
        $this->transactionManager = Mockery::mock(TransactionManagerPort::class);
        $this->transactionManager->shouldReceive('run')
            ->andReturnUsing(function ($closure) {
                return $closure();
            });

        $this->useCase = new IncidentUseCase(
            $this->incidentRepository,
            $this->fileStoragePort,
            $this->transactionManager
        );
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }

    public function test_update_throws_exception_if_incident_cannot_be_edited(): void
    {
        // 1. Arrange
        $incidentId = 1;
        $data = new UpdateIncidentInputData(
            title: 'Test',
            description: 'Test desc',
            categoryId: 1,
            priorityId: 1,
            subcategoryId: null,
            address: null,
            latitude: 0.0,
            longitude: 0.0,
            territorialUnitId: 1,
            resolutionDate: null
        );

        $state = new IncidentState(id: 4, name: 'Closed', allowsEdition: false, isFinal: true);
        $incident = new Incident(
            id: $incidentId,
            code: 'INC-001',
            title: 'Title',
            description: 'Desc',
            reporterUserId: 1,
            assigneeUserId: null,
            stateId: 4,
            state: $state
        );

        $this->incidentRepository->shouldReceive('load')
            ->with($incidentId, false)
            ->once()
            ->andReturn($incident);

        // 2. Act & Assert
        $this->expectException(IncidentException::class);
        $this->expectExceptionMessage('La incident ya no permite edicion en su estado actual.');
        
        $this->useCase->update($incidentId, $data);
    }

    public function test_attach_file_calls_storage_port_and_repository(): void
    {
        // 1. Arrange
        $incidentId = 1;
        $userId = 2;
        $fileData = new UploadedFileData('test.jpg', 'image/jpeg', 100, '/tmp/test.jpg');
        $storedFile = new StoredFileData('test.jpg', 'path/to/test.jpg', 'image/jpeg', 100, 'hash');
        
        $this->fileStoragePort->shouldReceive('storeIncidentFile')
            ->with($incidentId, $fileData)
            ->once()
            ->andReturn($storedFile);

        $attachmentMock = new \App\Incidents\Application\DTOs\AttachmentData(
            id: 1,
            incidentId: $incidentId,
            userId: $userId,
            originalName: 'test.jpg',
            filePath: 'path/to/test.jpg',
            fileUrl: null,
            mimeType: 'image/jpeg',
            fileSizeBytes: 100,
            fileHash: 'hash',
            createdAt: null,
            user: null
        );
        $this->incidentRepository->shouldReceive('attachFile')
            ->with($incidentId, $userId, $storedFile)
            ->once()
            ->andReturn($attachmentMock);

        // 2. Act
        $result = $this->useCase->attachFile($incidentId, $userId, $fileData);

        // 3. Assert
        $this->assertSame($attachmentMock, $result);
    }

    public function test_change_state_throws_if_transition_not_allowed(): void
    {
        // 1. Arrange
        $incidentId = 1;
        $userId = 2;
        $roleCodes = ['OPERATOR'];
        $data = new ChangeStateInputData(stateId: 3, comment: null);
        
        $state = new IncidentState(id: 1, name: 'Open', allowsEdition: true, isFinal: false);
        $incident = new Incident(
            id: $incidentId,
            code: 'INC-001',
            title: 'Title',
            description: 'Desc',
            reporterUserId: 1,
            assigneeUserId: null,
            stateId: 1,
            state: $state
        );

        $this->incidentRepository->shouldReceive('load')
            ->with($incidentId, false)
            ->once()
            ->andReturn($incident);

        $this->incidentRepository->shouldReceive('findTransition')
            ->with(1, 3)
            ->once()
            ->andReturn(null);

        // 2. Act & Assert
        $this->expectException(IncidentException::class);
        $this->expectExceptionMessage('La transicion de estado no esta permitida.');

        $this->useCase->changeState($incidentId, $userId, $roleCodes, $data);
    }

    public function test_change_state_throws_if_transition_forbidden_for_role(): void
    {
        // 1. Arrange
        $incidentId = 1;
        $userId = 2;
        $roleCodes = ['OPERATOR'];
        $data = new ChangeStateInputData(stateId: 3, comment: null);
        
        $state = new IncidentState(id: 1, name: 'Open', allowsEdition: true, isFinal: false);
        $incident = new Incident(
            id: $incidentId,
            code: 'INC-001',
            title: 'Title',
            description: 'Desc',
            reporterUserId: 1,
            assigneeUserId: null,
            stateId: 1,
            state: $state
        );

        $this->incidentRepository->shouldReceive('load')
            ->with($incidentId, false)
            ->once()
            ->andReturn($incident);

        $transition = new IncidentTransition(
            fromStateId: 1,
            toStateId: 3,
            allowedRoleCodes: ['SUPERVISOR'],
            requiresComment: false
        );

        $this->incidentRepository->shouldReceive('findTransition')
            ->with(1, 3)
            ->once()
            ->andReturn($transition);

        // 2. Act & Assert
        $this->expectException(IncidentException::class);
        $this->expectExceptionMessage('Tu rol no puede ejecutar esta transicion.');

        $this->useCase->changeState($incidentId, $userId, $roleCodes, $data);
    }
}
