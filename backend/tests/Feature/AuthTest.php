<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Jobs\ProcessGoogleRegistration;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Auth\Infrastructure\Persistence\Models\UserIdentity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_user_can_login_with_correct_credentials(): void
    {
        $password = 'password-de-prueba';
        $user = User::factory()->create([
            'email' => 'test-login@incidencias.local',
            'password' => $password,
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => $password,
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'message',
                'access_token',
                'token_type',
                'user' => [
                    'id',
                    'nombre',
                    'apellido',
                    'email',
                    'activo',
                ],
            ]);

        $this->assertCount(1, $user->fresh()->tokens);
        $this->assertNotNull($user->fresh()->last_login);

        $this->assertDatabaseHas('audit.access_logs', [
            'email' => $user->email,
            'user_id' => $user->id,
            'is_success' => true,
            'failure_reason' => null,
        ]);
    }

    public function test_user_can_register_with_email_and_password(): void
    {
        Notification::fake();

        $response = $this->postJson('/api/register', [
            'first_name' => 'Damian',
            'last_name' => 'Torres',
            'username' => 'damian.torres',
            'email' => 'registro-local@incidencias.local',
            'password' => 'password-de-prueba',
            'password_confirmation' => 'password-de-prueba',
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'message',
                'access_token',
                'token_type',
                'expires_at',
                'expires_in',
                'verification_sent',
                'user' => [
                    'id',
                    'nombre',
                    'apellido',
                    'email',
                    'username',
                ],
            ]);

        $user = User::where('email', 'registro-local@incidencias.local')->firstOrFail();

        $this->assertNull($user->email_verified_at);
        $this->assertDatabaseHas('auth.user_identities', [
            'user_id' => $user->id,
            'provider' => 'local',
            'provider_uid' => 'registro-local@incidencias.local',
        ]);
    }

    public function test_user_can_register_with_google_token(): void
    {
        Notification::fake();

        app()->instance('firebase.auth', new class {
            public function verifyIdToken(string $idToken): object
            {
                return new class {
                    public function claims(): object
                    {
                        return new class {
                            public function get(string $key): mixed
                            {
                                return match ($key) {
                                    'sub' => 'firebase-google-uid-001',
                                    'email' => 'registro-google@incidencias.local',
                                    'email_verified' => true,
                                    'name' => 'Google Usuario',
                                    'given_name' => 'Google',
                                    'family_name' => 'Usuario',
                                    'picture' => 'https://example.com/avatar.png',
                                    default => null,
                                };
                            }
                        };
                    }
                };
            }
        });

        $response = $this->postJson('/api/auth/google', [
            'intent' => 'register',
            'id_token' => 'fake-google-token',
        ]);

        $response->assertStatus(200)
            ->assertJsonStructure([
                'message',
                'access_token',
                'token_type',
                'expires_at',
                'expires_in',
                'email_verified',
                'user' => [
                    'id',
                    'nombre',
                    'apellido',
                    'email',
                ],
            ]);

        $user = User::where('email', 'registro-google@incidencias.local')->firstOrFail();

        $this->assertNotNull($user->email_verified_at);
        $this->assertDatabaseHas('auth.user_identities', [
            'user_id' => $user->id,
            'provider' => 'google',
            'provider_uid' => 'firebase-google-uid-001',
        ]);
    }

    public function test_google_registration_can_be_dispatched_asynchronously(): void
    {
        Bus::fake();

        $response = $this->postJson('/api/auth/google', [
            'intent' => 'register',
            'id_token' => 'fake-google-token',
            'flow_id' => 'flow-123',
        ]);

        $response->assertStatus(202)
            ->assertJson([
                'flow_id' => 'flow-123',
                'status' => 'queued',
            ]);

        Bus::assertDispatched(ProcessGoogleRegistration::class, function (ProcessGoogleRegistration $job) {
            return $job->flowId === 'flow-123'
                && $job->idToken === 'fake-google-token'
                && $job->intent === 'register';
        });
    }

    public function test_google_login_fails_if_user_not_found(): void
    {
        app()->instance('firebase.auth', new class {
            public function verifyIdToken(string $idToken): object
            {
                return new class {
                    public function claims(): object
                    {
                        return new class {
                            public function get(string $key): mixed
                            {
                                return match ($key) {
                                    'sub' => 'new-uid',
                                    'email' => 'new@incidencias.local',
                                    'email_verified' => true,
                                    default => null,
                                };
                            }
                        };
                    }
                };
            }
        });

        $response = $this->postJson('/api/auth/google', [
            'intent' => 'login',
            'id_token' => 'fake-token',
        ]);

        $response->assertStatus(404)
            ->assertJson(['message' => 'Usuario no encontrado.']);
    }

    public function test_google_register_fails_if_user_already_exists(): void
    {
        $user = User::factory()->create([
            'email' => 'existing@incidencias.local',
        ]);

        app()->instance('firebase.auth', new class {
            public function verifyIdToken(string $idToken): object
            {
                return new class {
                    public function claims(): object
                    {
                        return new class {
                            public function get(string $key): mixed
                            {
                                return match ($key) {
                                    'sub' => 'existing-uid',
                                    'email' => 'existing@incidencias.local',
                                    'email_verified' => true,
                                    default => null,
                                };
                            }
                        };
                    }
                };
            }
        });

        $response = $this->postJson('/api/auth/google', [
            'intent' => 'register',
            'id_token' => 'fake-token',
        ]);

        $response->assertStatus(409)
            ->assertJson(['message' => 'Ya estás registrado. Por favor, inicia sesión.']);
    }

    public function test_verified_user_can_complete_profile_with_username_only(): void
    {
        $user = User::factory()->create([
            'email' => 'perfil-google@incidencias.local',
            'email_verified_at' => now(),
            'username' => null,
        ]);

        UserIdentity::create([
            'user_id' => $user->id,
            'provider' => 'google',
            'provider_uid' => 'perfil-google-uid',
            'provider_email' => $user->email,
            'verified_at' => now(),
            'last_used_at' => now(),
            'provider_data' => [
                'source' => 'test',
            ],
        ]);

        $token = $user->createToken('test-token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/auth/profile', [
                'username' => 'perfil.google',
            ]);

        $response->assertStatus(200)
            ->assertJson([
                'message' => 'Perfil completado correctamente.',
            ]);

        $this->assertSame('perfil.google', $user->fresh()->username);
    }

    public function test_user_cannot_login_with_incorrect_password(): void
    {
        $user = User::factory()->create([
            'email' => 'test-incorrect@incidencias.local',
            'password' => 'correcto',
            'is_active' => true,
        ]);

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'incorrecto',
        ]);

        $response->assertStatus(401)
            ->assertJson([
                'message' => 'Las credenciales proporcionadas son incorrectas.',
            ]);

        $this->assertCount(0, $user->fresh()->tokens);

        $this->assertDatabaseHas('audit.access_logs', [
            'email' => $user->email,
            'user_id' => $user->id,
            'is_success' => false,
            'failure_reason' => 'Contrasena incorrecta',
        ]);
    }

    public function test_user_cannot_login_with_non_existent_email(): void
    {
        $response = $this->postJson('/api/login', [
            'email' => 'noexistente@incidencias.local',
            'password' => 'cualquiera',
        ]);

        $response->assertStatus(401)
            ->assertJson([
                'message' => 'Las credenciales proporcionadas son incorrectas.',
            ]);

        $this->assertDatabaseHas('audit.access_logs', [
            'email' => 'noexistente@incidencias.local',
            'user_id' => null,
            'is_success' => false,
            'failure_reason' => 'Usuario no encontrado',
        ]);
    }

    public function test_user_cannot_login_if_inactive(): void
    {
        $password = 'password-de-prueba';
        $user = User::factory()->inactivo()->create([
            'email' => 'test-inactivo@incidencias.local',
            'password' => $password,
        ]);

        $response = $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => $password,
        ]);

        $response->assertStatus(403)
            ->assertJson([
                'message' => 'El usuario está inactivo. Contacte al administrador.',
            ]);

        $this->assertCount(0, $user->fresh()->tokens);

        $this->assertDatabaseHas('audit.access_logs', [
            'email' => $user->email,
            'user_id' => $user->id,
            'is_success' => false,
            'failure_reason' => 'Usuario inactivo',
        ]);
    }

    public function test_authenticated_user_can_access_me(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test-token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/me');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'user' => [
                    'id',
                    'nombre',
                    'apellido',
                    'email',
                    'roles',
                ],
            ]);
    }

    public function test_unauthenticated_user_cannot_access_me(): void
    {
        $response = $this->getJson('/api/me');

        $response->assertStatus(401);
    }

    public function test_authenticated_user_can_logout(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('test-token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->postJson('/api/logout');

        $response->assertStatus(200)
            ->assertJson([
                'message' => 'Sesión cerrada correctamente.',
            ]);

        \Illuminate\Support\Facades\Auth::forgetGuards();

        $meResponse = $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/me');

        $meResponse->assertStatus(401);
    }
}
