<?php

namespace Tests\Feature;

use App\Audit\Infrastructure\Persistence\Models\AuditLog;
use App\Audit\Infrastructure\Persistence\Models\LoginAttempt;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Configuration;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAssignment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentAttachment;
use App\Incidents\Infrastructure\Persistence\Models\IncidentComment;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\StateChangeRequest;
use App\Incidents\Infrastructure\Persistence\Models\StateTransition;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use App\Operations\Infrastructure\Persistence\Models\OperatorProfile;
use App\Operations\Infrastructure\Persistence\Models\SupervisorOperatorAssignment;
use App\Operations\Infrastructure\Persistence\Models\SupervisorProfile;
use App\Operations\Infrastructure\Persistence\Models\UserTerritory;
use App\Shared\Infrastructure\Persistence\Concerns\Auditable;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use App\Users\Application\DTOs\SyncUserRolesInputData;
use App\Users\Domain\Repositories\AccessControlRepositoryInterface;
use App\Users\Domain\Repositories\UserRepositoryInterface;
use Database\Seeders\CategorySeeder;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\PrioritySeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\StateSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuditTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_list_audit_logs(): void
    {
        $admin = $this->authenticateAdmin();

        AuditLog::create([
            'auditable_type' => 'App\Auth\Infrastructure\Persistence\Models\User',
            'auditable_id' => 1,
            'event' => 'created',
            'old_values' => null,
            'new_values' => ['email' => 'demo@incidencias.local'],
            'url' => '/api/users',
            'user_id' => $admin['user']->id,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'PHPUnit',
            'tags' => ['user', 'creation'],
        ]);

        $response = $this->withToken($admin['token'])
            ->getJson('/api/audit/logs');

        $response->assertOk()
            ->assertJsonStructure([
                'data',
                'meta' => ['current_page', 'per_page', 'total', 'last_page'],
            ]);
    }

    public function test_admin_can_list_login_attempts(): void
    {
        $admin = $this->authenticateAdmin();

        LoginAttempt::create([
            'email' => 'intento@incidencias.local',
            'user_id' => $admin['user']->id,
            'login_type' => 'email',
            'is_success' => true,
            'failure_reason' => null,
            'session_id' => 'session_123',
            'ip_address' => '127.0.0.1',
            'user_agent' => 'PHPUnit',
        ]);

        $response = $this->withToken($admin['token'])
            ->getJson('/api/audit/login-attempts');

        $response->assertOk()
            ->assertJsonStructure([
                'data',
                'meta' => ['current_page', 'per_page', 'total', 'last_page'],
            ]);
    }

    public function test_incident_changes_are_written_to_audit_logs(): void
    {
        $this->seedCoreData();
        $admin = $this->authenticateAdmin();
        Sanctum::actingAs($admin['user'], ['*']);

        $incident = Incident::create([
            'code' => 'INC-AUDIT-001',
            'title' => 'Titulo inicial',
            'description' => 'Descripcion inicial para auditoria.',
            'category_id' => Category::firstOrFail()->id,
            'subcategory_id' => Subcategory::firstOrFail()->id,
            'priority_id' => Priority::firstOrFail()->id,
            'state_id' => State::firstOrFail()->id,
            'reported_by_id' => $admin['user']->id,
        ]);

        $incident->update(['title' => 'Titulo actualizado']);
        $incident->delete();

        $createdLog = AuditLog::where('auditable_type', Incident::class)
            ->where('auditable_id', $incident->id)
            ->where('event', 'created')
            ->firstOrFail();

        $updatedLog = AuditLog::where('auditable_type', Incident::class)
            ->where('auditable_id', $incident->id)
            ->where('event', 'updated')
            ->firstOrFail();

        $deletedLog = AuditLog::where('auditable_type', Incident::class)
            ->where('auditable_id', $incident->id)
            ->where('event', 'deleted')
            ->firstOrFail();

        $this->assertSame($admin['user']->id, $createdLog->user_id);
        $this->assertSame('Titulo inicial', $createdLog->new_values['title']);
        $this->assertSame('Titulo inicial', $updatedLog->old_values['title']);
        $this->assertSame('Titulo actualizado', $updatedLog->new_values['title']);
        $this->assertSame('Titulo actualizado', $deletedLog->old_values['title']);
    }

    public function test_user_audit_logs_do_not_store_sensitive_values(): void
    {
        $admin = $this->authenticateAdmin();
        Sanctum::actingAs($admin['user'], ['*']);

        $user = User::factory()->create([
            'email' => 'audited-user@incidencias.local',
            'password' => 'secret-password',
        ]);

        $user->update([
            'password' => 'new-secret-password',
            'first_name' => 'Auditado',
        ]);

        $createdLog = AuditLog::where('auditable_type', User::class)
            ->where('auditable_id', $user->id)
            ->where('event', 'created')
            ->firstOrFail();

        $updatedLog = AuditLog::where('auditable_type', User::class)
            ->where('auditable_id', $user->id)
            ->where('event', 'updated')
            ->firstOrFail();

        $this->assertSame($admin['user']->id, $createdLog->user_id);
        $this->assertArrayNotHasKey('password', $createdLog->new_values);
        $this->assertArrayNotHasKey('remember_token', $createdLog->new_values);
        $this->assertArrayNotHasKey('password', $updatedLog->old_values);
        $this->assertArrayNotHasKey('password', $updatedLog->new_values);
        $this->assertSame('Auditado', $updatedLog->new_values['first_name']);
    }

    public function test_audit_log_endpoint_filters_records_and_rejects_invalid_page_sizes(): void
    {
        $admin = $this->authenticateAdmin();

        AuditLog::query()->delete();
        AuditLog::create([
            'auditable_type' => Incident::class,
            'auditable_id' => 42,
            'event' => 'updated',
            'old_values' => ['title' => 'Anterior'],
            'new_values' => ['title' => 'Actual'],
            'user_id' => $admin['user']->id,
            'tags' => ['table' => 'core.incidents'],
        ]);
        AuditLog::create([
            'auditable_type' => User::class,
            'auditable_id' => 99,
            'event' => 'created',
            'new_values' => ['email' => 'otro@incidencias.local'],
            'user_id' => $admin['user']->id,
            'tags' => ['table' => 'auth.users'],
        ]);

        $this->withToken($admin['token'])
            ->getJson('/api/audit/logs?tabla=Incident&tabla_id=42&accion=updated&per_page=10')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.auditable_id', 42)
            ->assertJsonPath('data.0.event', 'updated')
            ->assertJsonPath('meta.total', 1);

        $this->withToken($admin['token'])
            ->getJson('/api/audit/logs?per_page=101')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('per_page');
    }

    public function test_user_without_audit_permission_cannot_read_logs(): void
    {
        $user = User::factory()->create([
            'email' => 'without-audit-permission@incidencias.local',
            'two_factor_confirmed_at' => now(),
        ]);

        $this->withToken($user->createToken('no-audit')->plainTextToken)
            ->getJson('/api/audit/logs')
            ->assertForbidden();
    }

    public function test_catalog_workflow_and_incident_collaboration_changes_are_audited(): void
    {
        $this->seedCoreData();
        $admin = $this->authenticateAdmin();
        Sanctum::actingAs($admin['user'], ['*']);
        $operator = User::factory()->create(['email' => 'audit-operator@incidencias.local']);

        $incident = Incident::create([
            'code' => 'INC-AUDIT-COVERAGE',
            'title' => 'Cobertura de auditoria',
            'description' => 'Incidencia para validar trazabilidad ampliada.',
            'category_id' => Category::firstOrFail()->id,
            'subcategory_id' => Subcategory::firstOrFail()->id,
            'priority_id' => Priority::firstOrFail()->id,
            'state_id' => State::firstOrFail()->id,
            'reported_by_id' => $admin['user']->id,
        ]);

        AuditLog::query()->delete();
        Category::firstOrFail()->update(['description' => 'Clasificacion auditada']);
        StateTransition::query()->firstOrFail()->update(['requires_comment' => true]);
        IncidentAssignment::create([
            'incident_id' => $incident->id,
            'user_id' => $operator->id,
            'assigned_by_id' => $admin['user']->id,
            'assignment_date' => now(),
        ]);
        IncidentComment::create([
            'incident_id' => $incident->id,
            'user_id' => $operator->id,
            'comment' => 'Seguimiento operativo auditado.',
            'is_internal' => true,
        ]);
        IncidentAttachment::create([
            'incident_id' => $incident->id,
            'user_id' => $operator->id,
            'original_name' => 'evidencia.jpg',
            'file_path' => 'incidents/audit/evidencia.jpg',
            'mime_type' => 'image/jpeg',
            'file_size_bytes' => 1024,
            'file_hash' => hash('sha256', 'audit-evidence'),
        ]);
        $stateChangeRequest = StateChangeRequest::create([
            'incident_id' => $incident->id,
            'requested_by_user_id' => $operator->id,
            'requested_state_id' => State::where('id', '!=', $incident->state_id)->firstOrFail()->id,
            'reason' => 'Solicitud auditada.',
        ]);
        $this->assertDatabaseHas('core.state_change_requests', [
            'id' => $stateChangeRequest->id,
            'incident_id' => $incident->id,
        ]);

        foreach ([Category::class, StateTransition::class, IncidentAssignment::class, IncidentComment::class, IncidentAttachment::class, StateChangeRequest::class] as $modelClass) {
            $this->assertDatabaseHas('audit.audit_logs', [
                'auditable_type' => $modelClass,
                'user_id' => $admin['user']->id,
            ]);
        }
    }

    public function test_sensitive_configuration_values_are_excluded_from_audit_snapshots(): void
    {
        $admin = $this->authenticateAdmin();
        Sanctum::actingAs($admin['user'], ['*']);

        $setting = Configuration::create([
            'key' => 'smtp.password',
            'value' => 'super-secret-value',
            'type' => 'string',
            'description' => 'Credencial SMTP',
        ]);

        $log = AuditLog::where('auditable_type', Configuration::class)
            ->where('auditable_id', $setting->id)
            ->where('event', 'created')
            ->firstOrFail();

        $this->assertArrayNotHasKey('value', $log->new_values);
        $this->assertSame('smtp.password', $log->new_values['key']);
    }

    public function test_critical_operational_models_use_the_auditable_concern(): void
    {
        $models = [
            Category::class,
            Subcategory::class,
            Priority::class,
            State::class,
            StateTransition::class,
            Configuration::class,
            IncidentAssignment::class,
            IncidentComment::class,
            IncidentAttachment::class,
            StateChangeRequest::class,
            TerritorialUnit::class,
            UserTerritory::class,
            SupervisorProfile::class,
            OperatorProfile::class,
            SupervisorOperatorAssignment::class,
        ];

        foreach ($models as $model) {
            $this->assertContains(Auditable::class, class_uses_recursive($model));
        }
    }

    public function test_role_and_permission_assignments_are_audited(): void
    {
        $admin = $this->authenticateAdmin();
        Sanctum::actingAs($admin['user'], ['*']);
        $managedUser = User::factory()->create(['email' => 'role-audit@incidencias.local']);
        $citizenRole = Role::where('code', 'CIUDADANO')->firstOrFail();
        $operatorRole = Role::where('code', 'OPERADOR')->firstOrFail();
        $managedUser->roles()->sync([$citizenRole->id]);
        AuditLog::query()->delete();

        app(UserRepositoryInterface::class)->syncRoles(new SyncUserRolesInputData(
            userId: (int) $managedUser->id,
            roleCodes: ['OPERADOR'],
            assignedBy: (int) $admin['user']->id
        ));

        $userRoleLog = AuditLog::where('auditable_type', User::class)
            ->where('auditable_id', $managedUser->id)
            ->where('event', 'updated')
            ->firstOrFail();

        $this->assertSame(['CIUDADANO'], $userRoleLog->old_values['roles']);
        $this->assertSame(['OPERADOR'], $userRoleLog->new_values['roles']);
        $this->assertSame($admin['user']->id, $userRoleLog->user_id);

        $permissionCode = 'audit.view';
        app(AccessControlRepositoryInterface::class)->syncRolePermissions(
            (int) $operatorRole->id,
            [$permissionCode]
        );

        $rolePermissionLog = AuditLog::where('auditable_type', Role::class)
            ->where('auditable_id', $operatorRole->id)
            ->where('event', 'updated')
            ->latest('id')
            ->firstOrFail();

        $this->assertSame([$permissionCode], $rolePermissionLog->new_values['permissions']);
        $this->assertSame($admin['user']->id, $rolePermissionLog->user_id);
    }

    public function test_operational_structure_assignments_are_audited(): void
    {
        $admin = $this->authenticateAdmin();
        Sanctum::actingAs($admin['user'], ['*']);
        $supervisor = User::factory()->create(['email' => 'audit-supervisor@incidencias.local']);
        $operator = User::factory()->create(['email' => 'audit-operator-structure@incidencias.local']);
        $territory = TerritorialUnit::create([
            'name' => 'Territorio de auditoria',
            'type' => TerritorialUnit::TYPE_OPERATIONAL_ZONE,
            'code' => 'AUDIT-ZONE',
            'is_active' => true,
        ]);
        AuditLog::query()->delete();

        $supervisorProfile = SupervisorProfile::create([
            'user_id' => $supervisor->id,
            'max_operators' => 5,
            'active' => true,
        ]);
        $operatorProfile = OperatorProfile::create([
            'user_id' => $operator->id,
            'incident_capacity' => 20,
            'max_active_incidents' => 10,
            'max_workload_points' => 20,
            'active' => true,
        ]);
        $assignment = SupervisorOperatorAssignment::create([
            'supervisor_user_id' => $supervisor->id,
            'operator_user_id' => $operator->id,
            'assigned_by' => $admin['user']->id,
            'assigned_at' => now(),
            'is_active' => true,
        ]);
        $territoryAssignment = UserTerritory::create([
            'user_id' => $operator->id,
            'territorial_unit_id' => $territory->id,
            'assigned_by' => $admin['user']->id,
            'assigned_at' => now(),
            'is_active' => true,
        ]);

        foreach ([$supervisorProfile, $operatorProfile, $assignment, $territoryAssignment] as $model) {
            $this->assertDatabaseHas('audit.audit_logs', [
                'auditable_type' => $model::class,
                'auditable_id' => $model->id,
                'event' => 'created',
                'user_id' => $admin['user']->id,
            ]);
        }
    }

    private function authenticateAdmin(): array
    {
        $this->seed([RoleSeeder::class, PermissionSeeder::class]);

        $user = User::factory()->create([
            'email' => 'admin-audit@incidencias.local',
            'two_factor_confirmed_at' => now(),
        ]);

        $role = Role::where('code', 'ADMIN')->firstOrFail();
        $user->roles()->sync([$role->id]);

        return [
            'user' => $user,
            'token' => $user->createToken('test-token')->plainTextToken,
        ];
    }

    private function seedCoreData(): void
    {
        $this->seed([
            RoleSeeder::class,
            PermissionSeeder::class,
            StateSeeder::class,
            PrioritySeeder::class,
            CategorySeeder::class,
        ]);
    }
}
