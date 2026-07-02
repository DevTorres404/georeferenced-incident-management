<?php

namespace Tests\Feature;

use App\Auth\Application\Ports\TwoFactorAuthPort;
use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Auth\Infrastructure\Persistence\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Mockery;

class TwoFactorAuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RoleSeeder::class, PermissionSeeder::class]);
    }

    public function test_user_can_enable_2fa_and_get_qr_code(): void
    {
        $user = User::factory()->create();

        $mockPort = Mockery::mock(TwoFactorAuthPort::class);
        $mockPort->shouldReceive('generateSecretKey')->once()->andReturn('ABCDEF123456');
        $mockPort->shouldReceive('getQRCodeUrl')->once()->andReturn('otpauth://totp/Test?secret=ABCDEF123456');
        $this->app->instance(TwoFactorAuthPort::class, $mockPort);

        $response = $this->actingAs($user)
            ->postJson('/api/auth/2fa/enable');
            
        $response->assertOk()
            ->assertJsonPath('qr_url', 'otpauth://totp/Test?secret=ABCDEF123456');

        $this->assertDatabaseHas('auth.users', [
            'id' => $user->id,
            'two_factor_secret' => 'ABCDEF123456',
        ]);
    }

    public function test_user_can_confirm_2fa_setup(): void
    {
        $user = User::factory()->create([
            'two_factor_secret' => 'ABCDEF123456',
        ]);

        $mockPort = Mockery::mock(TwoFactorAuthPort::class);
        $mockPort->shouldReceive('verifyKey')->with('ABCDEF123456', '123456')->once()->andReturn(true);
        $this->app->instance(TwoFactorAuthPort::class, $mockPort);

        $response = $this->actingAs($user)
            ->postJson('/api/auth/2fa/confirm', [
                'code' => '123456',
            ]);

        $response->assertOk();

        $this->assertNotNull($user->fresh()->two_factor_confirmed_at);
    }

    public function test_confirm_2fa_setup_returns_validation_error_when_code_is_invalid(): void
    {
        $user = User::factory()->create([
            'two_factor_secret' => 'ABCDEF123456',
        ]);

        $mockPort = Mockery::mock(TwoFactorAuthPort::class);
        $mockPort->shouldReceive('verifyKey')->with('ABCDEF123456', '000000')->once()->andReturn(false);
        $this->app->instance(TwoFactorAuthPort::class, $mockPort);

        $response = $this->actingAs($user)
            ->postJson('/api/auth/2fa/confirm', [
                'code' => '000000',
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors('code');

        $this->assertNull($user->fresh()->two_factor_confirmed_at);
    }

    public function test_login_requires_2fa_if_enabled(): void
    {
        $user = User::factory()->create([
            'email' => '2fauser@incidencias.local',
            'password' => bcrypt('password'),
            'two_factor_secret' => 'ABCDEF123456',
            'two_factor_confirmed_at' => now(),
        ]);

        $response = $this->postJson('/api/login', [
            'email' => '2fauser@incidencias.local',
            'password' => 'password',
        ]);

        $response->assertOk()
            ->assertJsonPath('requires_2fa', true)
            ->assertJsonPath('message', 'Se requiere verificación de dos factores.');

        $this->assertNotNull($response->json('two_factor_token'));
    }

    public function test_user_can_verify_2fa_login(): void
    {
        $user = User::factory()->create([
            'email' => '2fauser@incidencias.local',
            'password' => bcrypt('password'),
            'two_factor_secret' => 'ABCDEF123456',
            'two_factor_confirmed_at' => now(),
        ]);

        $loginResponse = $this->postJson('/api/login', [
            'email' => '2fauser@incidencias.local',
            'password' => 'password',
        ]);

        $token = $loginResponse->json('two_factor_token');

        $mockPort = Mockery::mock(TwoFactorAuthPort::class);
        $mockPort->shouldReceive('verifyKey')->with('ABCDEF123456', '123456')->once()->andReturn(true);
        $this->app->instance(TwoFactorAuthPort::class, $mockPort);

        $verifyResponse = $this->postJson('/api/auth/2fa/verify-login', [
            'two_factor_token' => $token,
            'code' => '123456',
        ]);

        $verifyResponse->assertOk()
            ->assertJsonStructure(['access_token', 'user']);
    }

    public function test_verify_2fa_login_returns_validation_error_when_code_is_incorrect(): void
    {
        $user = User::factory()->create([
            'email' => '2fauser-invalid-code@incidencias.local',
            'password' => bcrypt('password'),
            'two_factor_secret' => 'ABCDEF123456',
            'two_factor_confirmed_at' => now(),
        ]);

        $loginResponse = $this->postJson('/api/login', [
            'email' => '2fauser-invalid-code@incidencias.local',
            'password' => 'password',
        ]);

        $token = $loginResponse->json('two_factor_token');

        $mockPort = Mockery::mock(TwoFactorAuthPort::class);
        $mockPort->shouldReceive('verifyKey')->with('ABCDEF123456', '000000')->once()->andReturn(false);
        $this->app->instance(TwoFactorAuthPort::class, $mockPort);

        $verifyResponse = $this->postJson('/api/auth/2fa/verify-login', [
            'two_factor_token' => $token,
            'code' => '000000',
        ]);

        $verifyResponse->assertStatus(422)
            ->assertJsonValidationErrors('code');

        $this->assertNotNull($user->fresh()->two_factor_secret);
    }

    public function test_admin_is_blocked_without_2fa(): void
    {
        $user = User::factory()->create([
            'email' => 'admin-no-2fa@incidencias.local',
        ]);
        $role = Role::where('code', 'ADMIN')->firstOrFail();
        $user->roles()->sync([$role->id]);

        $response = $this->actingAs($user)->getJson('/api/users');

        $response->assertForbidden()
            ->assertJsonPath('message', 'Los administradores deben configurar la autenticación de dos factores.');
    }
}
