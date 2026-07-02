<?php

namespace Tests\Feature;

use App\Audit\Infrastructure\Persistence\Models\AuditLog;
use App\Audit\Infrastructure\Persistence\Models\LoginAttempt;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
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
