<?php

namespace Tests\Feature;

use App\Audit\Infrastructure\Persistence\Models\AuditLog;
use App\Audit\Infrastructure\Persistence\Models\LoginAttempt;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
