<?php

namespace Tests\Unit\UseCases;

use App\Incidents\Application\DTOs\AttachmentData;
use App\Incidents\Application\DTOs\ChangeStateInputData;
use App\Incidents\Application\DTOs\RequestStateChangeInputData;
use App\Incidents\Application\DTOs\StateChangeRequestData;
use App\Incidents\Application\DTOs\UpdateIncidentInputData;
use App\Incidents\Application\Ports\IncidentStateChangeNotifierPort;
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
use RuntimeException;

class IncidentUseCaseTest extends TestCase
{
    private IncidentRepositoryInterface $incidentRepository;

    private FileStoragePort $fileStoragePort;

    private TransactionManagerPort $transactionManager;

    private IncidentStateChangeNotifierPort $stateChangeNotifier;

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
            })->byDefault();
        $this->stateChangeNotifier = Mockery::mock(IncidentStateChangeNotifierPort::class);

        $this->useCase = new IncidentUseCase(
            $this->incidentRepository,
            $this->fileStoragePort,
            $this->transactionManager,
            $this->stateChangeNotifier
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

        $attachmentMock = new AttachmentData(
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

        $this->incidentRepository->shouldReceive('loadForUpdate')
            ->with($incidentId)
            ->once()
            ->andReturn($incident);

        $this->incidentRepository->shouldReceive('findTransition')
            ->with(1, 3)
            ->once()
            ->andReturn(null);

        // 2. Act & Assert
        $this->expectException(IncidentException::class);
        $this->expectExceptionMessage('La transicion de estado no esta permitida.');

        $this->useCase->changeState($incidentId, $userId, $roleCodes, false, $data);
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

        $this->incidentRepository->shouldReceive('loadForUpdate')
            ->with($incidentId)
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

        $this->useCase->changeState($incidentId, $userId, $roleCodes, false, $data);
    }

    public function test_change_state_rejects_blank_comment_when_transition_requires_it(): void
    {
        $incidentId = 1;
        $userId = 2;
        $incident = $this->incidentWithState($incidentId, 'CERRADA');
        $transition = new IncidentTransition(
            fromStateId: 1,
            toStateId: 5,
            requiresComment: true,
            allowedRoleCodes: ['ADMIN', 'SUPERVISOR']
        );

        $this->incidentRepository->shouldReceive('loadForUpdate')
            ->with($incidentId)
            ->times(8)
            ->andReturn($incident);
        $this->incidentRepository->shouldReceive('findTransition')
            ->with(1, 5)
            ->times(8)
            ->andReturn($transition);
        $this->incidentRepository->shouldReceive('stateById')
            ->with(5)
            ->times(8)
            ->andReturn($this->state('REABIERTA'));
        $this->incidentRepository->shouldReceive('changeState')
            ->with(1, 2, Mockery::on(
                fn (ChangeStateInputData $data): bool => $data->comment === "\u{200B}Visible reason\u{200B}"
            ))
            ->once()
            ->andReturn($incident);

        foreach ([null, '', '   ', "\u{00A0}", "\u{2002}\u{2028}", "\u{200B}", "\xC3\x28"] as $comment) {
            try {
                $this->useCase->changeState(
                    $incidentId,
                    $userId,
                    ['ADMIN'],
                    true,
                    new ChangeStateInputData(stateId: 5, comment: $comment)
                );

                $this->fail('A required transition comment cannot be blank.');
            } catch (IncidentException $exception) {
                $this->assertSame('Esta transicion requiere comment.', $exception->getMessage());
            }
        }

        $this->assertSame(
            $incident,
            $this->useCase->changeState(
                $incidentId,
                $userId,
                ['ADMIN'],
                true,
                new ChangeStateInputData(stateId: 5, comment: "\u{200B}Visible reason\u{200B}")
            )
        );
    }

    public function test_change_state_requires_reopen_permission_only_for_reopened_target(): void
    {
        $incident = $this->incidentWithState(1, 'CERRADA');
        $reopeningTransition = new IncidentTransition(
            fromStateId: 1,
            toStateId: 5,
            requiresComment: false,
            allowedRoleCodes: ['ADMIN']
        );
        $unrelatedTransition = new IncidentTransition(
            fromStateId: 1,
            toStateId: 3,
            requiresComment: false,
            allowedRoleCodes: ['ADMIN']
        );

        $this->incidentRepository->shouldReceive('loadForUpdate')->with(1)->twice()->andReturn($incident);
        $this->incidentRepository->shouldReceive('findTransition')->with(1, 5)->once()->andReturn($reopeningTransition);
        $this->incidentRepository->shouldReceive('findTransition')->with(1, 3)->once()->andReturn($unrelatedTransition);
        $this->incidentRepository->shouldReceive('stateById')->with(5)->once()->andReturn($this->state('REABIERTA'));
        $this->incidentRepository->shouldReceive('stateById')->with(3)->once()->andReturn($this->state('EN_REVISION'));
        $this->incidentRepository->shouldReceive('changeState')
            ->with(1, 2, Mockery::on(fn (ChangeStateInputData $data): bool => $data->stateId === 3))
            ->once()
            ->andReturn($incident);

        try {
            $this->useCase->changeState(1, 2, ['ADMIN'], false, new ChangeStateInputData(5, 'Reason'));
            $this->fail('Reopening without incidents.reopen must be forbidden.');
        } catch (IncidentException $exception) {
            $this->assertSame('Tu rol no puede ejecutar esta transicion.', $exception->getMessage());
        }

        $this->assertSame(
            $incident,
            $this->useCase->changeState(1, 2, ['ADMIN'], false, new ChangeStateInputData(3))
        );
    }

    public function test_change_state_runs_repository_persistence_inside_transaction_and_propagates_failure(): void
    {
        $incident = $this->incidentWithState(1, 'EN_REVISION');
        $transition = new IncidentTransition(
            fromStateId: 1,
            toStateId: 3,
            requiresComment: false,
            allowedRoleCodes: ['ADMIN']
        );

        $this->transactionManager->shouldReceive('run')
            ->once()
            ->andReturnUsing(fn ($operation) => $operation());
        $this->incidentRepository->shouldReceive('loadForUpdate')->with(1)->once()->andReturn($incident);
        $this->incidentRepository->shouldReceive('findTransition')->with(1, 3)->once()->andReturn($transition);
        $this->incidentRepository->shouldReceive('stateById')->with(3)->once()->andReturn($this->state('EN_PROGRESO'));
        $this->incidentRepository->shouldReceive('changeState')
            ->with(1, 2, Mockery::type(ChangeStateInputData::class))
            ->once()
            ->andThrow(new RuntimeException('Notification persistence failed.'));

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('Notification persistence failed.');

        $this->useCase->changeState(1, 2, ['ADMIN'], false, new ChangeStateInputData(3));
    }

    // ── State Change Requests ──────────────────────────

    public function test_request_state_change_succeeds_for_operator(): void
    {
        $incidentId = 10;
        $userId = 5;
        $roleCodes = ['OPERADOR'];
        $data = new RequestStateChangeInputData(stateId: 3, reason: 'Task completed');

        $expected = new StateChangeRequestData(
            id: 1,
            incidentId: $incidentId,
            requestedByUserId: $userId,
            requestedByUserName: 'Test User',
            requestedStateId: 3,
            requestedStateName: 'Resuelta',
            reason: 'Task completed',
            status: 'pending',
            reviewedByUserId: null,
            reviewedByUserName: null,
            reviewerComment: null,
            createdAt: '2026-01-01T00:00:00+00:00',
            reviewedAt: null,
        );

        $this->incidentRepository->shouldReceive('loadForUpdate')
            ->with($incidentId)
            ->once()
            ->andReturn($this->incidentWithState($incidentId, 'EN_PROGRESO'));

        $this->incidentRepository->shouldReceive('stateById')
            ->with(3)
            ->once()
            ->andReturn($this->state('RESUELTA'));

        $this->incidentRepository->shouldReceive('hasActiveAssignment')
            ->with($incidentId, $userId)
            ->once()
            ->andReturn(true);

        $this->incidentRepository->shouldReceive('findPendingStateChangeRequest')
            ->with($incidentId)
            ->once()
            ->andReturn(null);

        $this->incidentRepository->shouldReceive('createStateChangeRequest')
            ->with($incidentId, $userId, $data)
            ->once()
            ->andReturn($expected);

        $this->stateChangeNotifier->shouldReceive('notifyStateChangeRequested')
            ->with($incidentId, $userId, 'Resuelta', 'Task completed')
            ->once();

        $result = $this->useCase->requestStateChange($incidentId, $userId, $roleCodes, $data);

        $this->assertSame($expected, $result);
        $this->assertSame('pending', $result->status);
    }

    public function test_request_state_change_fails_if_not_operator(): void
    {
        $data = new RequestStateChangeInputData(stateId: 3, reason: 'Done');

        $this->expectException(IncidentException::class);
        $this->expectExceptionMessage('Los operadores no pueden cambiar el estado directamente.');

        $this->useCase->requestStateChange(10, 5, ['SUPERVISOR'], $data);
    }

    public function test_request_state_change_fails_if_pending_exists(): void
    {
        $data = new RequestStateChangeInputData(stateId: 3, reason: 'Done');

        $existingPending = new StateChangeRequestData(
            id: 99,
            incidentId: 10,
            requestedByUserId: 5,
            requestedByUserName: 'Test',
            requestedStateId: 3,
            requestedStateName: 'Resuelta',
            reason: 'Previous request',
            status: 'pending',
            reviewedByUserId: null,
            reviewedByUserName: null,
            reviewerComment: null,
            createdAt: '2026-01-01T00:00:00+00:00',
            reviewedAt: null,
        );

        $this->incidentRepository->shouldReceive('loadForUpdate')
            ->with(10)
            ->once()
            ->andReturn($this->incidentWithState(10, 'EN_PROGRESO'));
        $this->incidentRepository->shouldReceive('stateById')->with(3)->once()->andReturn($this->state('RESUELTA'));
        $this->incidentRepository->shouldReceive('hasActiveAssignment')->with(10, 5)->once()->andReturn(true);

        $this->incidentRepository->shouldReceive('findPendingStateChangeRequest')
            ->with(10)
            ->once()
            ->andReturn($existingPending);

        $this->expectException(IncidentException::class);
        $this->expectExceptionMessage('Ya existe una solicitud de cambio de estado pendiente');

        $this->useCase->requestStateChange(10, 5, ['OPERADOR'], $data);
    }

    public function test_request_state_change_requires_en_progreso(): void
    {
        $this->incidentRepository->shouldReceive('loadForUpdate')
            ->with(10)
            ->once()
            ->andReturn($this->incidentWithState(10, 'EN_REVISION'));

        $this->expectException(IncidentException::class);
        $this->expectExceptionMessage('Solo se puede solicitar la resolucion de una incidencia en progreso.');

        $this->useCase->requestStateChange(
            10,
            5,
            ['OPERADOR'],
            new RequestStateChangeInputData(stateId: 3, reason: 'Done')
        );
    }

    public function test_request_state_change_requires_resuelta_target(): void
    {
        $this->incidentRepository->shouldReceive('loadForUpdate')
            ->with(10)
            ->once()
            ->andReturn($this->incidentWithState(10, 'EN_PROGRESO'));
        $this->incidentRepository->shouldReceive('stateById')->with(5)->once()->andReturn($this->state('CERRADA'));

        $this->expectException(IncidentException::class);
        $this->expectExceptionMessage('Los operadores solo pueden solicitar el estado RESUELTA.');

        $this->useCase->requestStateChange(
            10,
            5,
            ['OPERADOR'],
            new RequestStateChangeInputData(stateId: 5, reason: 'Done')
        );
    }

    public function test_request_state_change_requires_active_assignment(): void
    {
        $this->incidentRepository->shouldReceive('loadForUpdate')
            ->with(10)
            ->once()
            ->andReturn($this->incidentWithState(10, 'EN_PROGRESO'));
        $this->incidentRepository->shouldReceive('stateById')->with(3)->once()->andReturn($this->state('RESUELTA'));
        $this->incidentRepository->shouldReceive('hasActiveAssignment')->with(10, 5)->once()->andReturn(false);

        $this->expectException(IncidentException::class);
        $this->expectExceptionMessage('Debes tener una asignacion activa en la incidencia');

        $this->useCase->requestStateChange(
            10,
            5,
            ['OPERADOR'],
            new RequestStateChangeInputData(stateId: 3, reason: 'Done')
        );
    }

    public function test_approve_state_change_succeeds_for_supervisor(): void
    {
        $requestId = 1;
        $userId = 3;
        $roleCodes = ['SUPERVISOR'];
        $comment = 'Approved';

        $requestData = new StateChangeRequestData(
            id: $requestId,
            incidentId: 10,
            requestedByUserId: 5,
            requestedByUserName: 'Operator',
            requestedStateId: 3,
            requestedStateName: 'Resuelta',
            reason: 'Task completed',
            status: 'pending',
            reviewedByUserId: null,
            reviewedByUserName: null,
            reviewerComment: null,
            createdAt: '2026-01-01T00:00:00+00:00',
            reviewedAt: null,
        );

        $this->incidentRepository->shouldReceive('findStateChangeRequestById')
            ->with($requestId)
            ->once()
            ->andReturn($requestData);

        $this->incidentRepository->shouldReceive('approveStateChangeRequest')
            ->with(10, $requestId, $userId, $comment)
            ->once();

        $this->stateChangeNotifier->shouldReceive('notifyStateChangeApproved')
            ->with(10, 5)
            ->once();

        $this->useCase->approveStateChange(10, $requestId, $userId, $roleCodes, $comment);
        $this->assertTrue(true);
    }

    public function test_approve_state_change_fails_for_operator(): void
    {
        $this->expectException(IncidentException::class);
        $this->expectExceptionMessage('No tienes permisos para revisar esta solicitud');

        $this->useCase->approveStateChange(10, 1, 5, ['OPERADOR'], 'Ok');
    }

    public function test_approve_state_change_fails_if_not_found(): void
    {
        $this->incidentRepository->shouldReceive('findStateChangeRequestById')
            ->with(999)
            ->once()
            ->andReturn(null);

        $this->expectException(IncidentException::class);
        $this->expectExceptionMessage('La solicitud de cambio de estado no existe.');

        $this->useCase->approveStateChange(10, 999, 3, ['SUPERVISOR'], null);
    }

    public function test_reject_state_change_succeeds_for_supervisor(): void
    {
        $requestId = 2;
        $userId = 3;
        $roleCodes = ['ADMIN'];
        $comment = 'Needs more info';

        $requestData = new StateChangeRequestData(
            id: $requestId,
            incidentId: 10,
            requestedByUserId: 5,
            requestedByUserName: 'Operator',
            requestedStateId: 3,
            requestedStateName: 'Resuelta',
            reason: 'Task completed',
            status: 'pending',
            reviewedByUserId: null,
            reviewedByUserName: null,
            reviewerComment: null,
            createdAt: '2026-01-01T00:00:00+00:00',
            reviewedAt: null,
        );

        $this->incidentRepository->shouldReceive('findStateChangeRequestById')
            ->with($requestId)
            ->once()
            ->andReturn($requestData);

        $this->incidentRepository->shouldReceive('rejectStateChangeRequest')
            ->with($requestId, $userId, $comment)
            ->once();

        $this->stateChangeNotifier->shouldReceive('notifyStateChangeRejected')
            ->with(10, 5, $comment)
            ->once();

        $this->useCase->rejectStateChange(10, $requestId, $userId, $roleCodes, $comment);
        $this->assertTrue(true);
    }

    public function test_reject_state_change_fails_for_operator(): void
    {
        $this->expectException(IncidentException::class);
        $this->expectExceptionMessage('No tienes permisos para revisar esta solicitud');

        $this->useCase->rejectStateChange(10, 1, 5, ['OPERADOR'], 'No');
    }

    public function test_approve_state_change_rejects_request_from_another_incident(): void
    {
        $request = new StateChangeRequestData(
            id: 1,
            incidentId: 11,
            requestedByUserId: 5,
            requestedByUserName: 'Operator',
            requestedStateId: 3,
            requestedStateName: 'Resuelta',
            reason: 'Done',
            status: 'pending',
            reviewedByUserId: null,
            reviewedByUserName: null,
            reviewerComment: null,
            createdAt: '2026-01-01T00:00:00+00:00',
            reviewedAt: null,
        );

        $this->incidentRepository->shouldReceive('findStateChangeRequestById')
            ->with(1)
            ->once()
            ->andReturn($request);

        $this->expectException(IncidentException::class);
        $this->expectExceptionMessage('La solicitud de cambio de estado no existe.');

        $this->useCase->approveStateChange(10, 1, 3, ['SUPERVISOR'], null);
    }

    private function incidentWithState(int $incidentId, string $stateName): Incident
    {
        return new Incident(
            id: $incidentId,
            code: "INC-{$incidentId}",
            title: 'Incident',
            description: 'Description',
            reporterUserId: 1,
            assigneeUserId: null,
            stateId: 1,
            state: $this->state($stateName)
        );
    }

    private function state(string $name): IncidentState
    {
        return new IncidentState(id: 1, name: $name, allowsEdition: false, isFinal: false);
    }
}
