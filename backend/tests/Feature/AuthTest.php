<?php

namespace Tests\Feature;

use App\Audit\Infrastructure\Persistence\Models\AuditLog;
use App\Auth\Infrastructure\Jobs\ProcessGoogleRegistration;
use App\Auth\Infrastructure\Notifications\PasswordChangedNotification;
use App\Auth\Infrastructure\Notifications\PasswordResetCodeNotification;
use App\Auth\Infrastructure\Notifications\PasswordResetCompletedNotification;
use App\Auth\Infrastructure\Persistence\Models\PasswordResetToken;
use App\Auth\Infrastructure\Persistence\Models\User;
use App\Auth\Infrastructure\Persistence\Models\UserIdentity;
use App\Shared\Infrastructure\Jobs\NotifyAdminsJob;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
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
        Bus::fake([NotifyAdminsJob::class]);
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
                'verification_sent',
            ]);

        $user = User::where('email', 'registro-local@incidencias.local')->firstOrFail();

        $this->assertNull($user->email_verified_at);
        $this->assertCount(0, $user->tokens);
        $this->assertDatabaseHas('auth.user_identities', [
            'user_id' => $user->id,
            'provider' => 'local',
            'provider_uid' => 'registro-local@incidencias.local',
        ]);
        Bus::assertDispatched(NotifyAdminsJob::class);
    }

    public function test_user_can_register_with_google_token(): void
    {
        Notification::fake();
        Storage::fake('rustfs');
        Http::fake([
            'https://lh3.googleusercontent.com/*' => Http::response(
                'fake-google-avatar',
                200,
                ['Content-Type' => 'image/jpeg']
            ),
        ]);

        $googlePhotoUrl = 'https://lh3.googleusercontent.com/a-/'.str_repeat('a', 600).'=s96-c';

        app()->instance('firebase.auth', new class($googlePhotoUrl)
        {
            public function __construct(private readonly string $googlePhotoUrl) {}

            public function verifyIdToken(string $idToken): object
            {
                return new class($this->googlePhotoUrl)
                {
                    public function __construct(private readonly string $googlePhotoUrl) {}

                    public function claims(): object
                    {
                        return new class($this->googlePhotoUrl)
                        {
                            public function __construct(private readonly string $googlePhotoUrl) {}

                            public function get(string $key): mixed
                            {
                                return match ($key) {
                                    'sub' => 'firebase-google-uid-001',
                                    'email' => 'registro-google@incidencias.local',
                                    'email_verified' => true,
                                    'name' => 'Google Usuario',
                                    'given_name' => 'Google',
                                    'family_name' => 'Usuario',
                                    'picture' => $this->googlePhotoUrl,
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
        $expectedProfilePhoto = 'profile-photos/google/'.hash('sha256', 'firebase-google-uid-001').'.jpg';

        $this->assertNotNull($user->email_verified_at);
        $this->assertSame($expectedProfilePhoto, $user->profile_photo);
        $this->assertLessThanOrEqual(255, strlen($user->profile_photo));
        Storage::disk('rustfs')->assertExists($expectedProfilePhoto);
        $this->assertDatabaseHas('auth.user_identities', [
            'user_id' => $user->id,
            'provider' => 'google',
            'provider_uid' => 'firebase-google-uid-001',
        ]);
    }

    public function test_username_mutator_preserves_null_and_normalizes_strings(): void
    {
        $user = new User;

        $user->username = null;
        $this->assertNull($user->username);

        $user->username = '  Mixed   Case  ';
        $this->assertSame('mixed case', $user->username);
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
        app()->instance('firebase.auth', new class
        {
            public function verifyIdToken(string $idToken): object
            {
                return new class
                {
                    public function claims(): object
                    {
                        return new class
                        {
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

        app()->instance('firebase.auth', new class
        {
            public function verifyIdToken(string $idToken): object
            {
                return new class
                {
                    public function claims(): object
                    {
                        return new class
                        {
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

        $response = $this->withHeader('Authorization', 'Bearer '.$token)
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

        $response = $this->withHeader('Authorization', 'Bearer '.$token)
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

        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->postJson('/api/logout');

        $response->assertStatus(200)
            ->assertJson([
                'message' => 'Sesión cerrada correctamente.',
            ]);

        Auth::forgetGuards();

        $meResponse = $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/me');

        $meResponse->assertStatus(401);
    }

    public function test_authenticated_user_can_change_password_with_valid_data(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'change-password@incidencias.local',
            'password' => 'password-actual',
            'is_active' => true,
        ]);

        $currentToken = $user->createToken('current-token')->plainTextToken;
        $otherToken = $user->createToken('other-token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer '.$currentToken)
            ->patchJson('/api/auth/password', [
                'current_password' => 'password-actual',
                'password' => 'password-nueva',
                'password_confirmation' => 'password-nueva',
            ]);

        $response->assertStatus(200)
            ->assertJson([
                'message' => 'Contrasena actualizada correctamente.',
            ]);

        Notification::assertSentTo($user->fresh(), PasswordChangedNotification::class);

        $this->assertTrue(Hash::check('password-nueva', $user->fresh()->password));
        $this->assertFalse(Hash::check('password-actual', $user->fresh()->password));

        $this->withHeader('Authorization', 'Bearer '.$currentToken)
            ->getJson('/api/me')
            ->assertOk();

        Auth::forgetGuards();

        $this->withHeader('Authorization', 'Bearer '.$otherToken)
            ->getJson('/api/me')
            ->assertUnauthorized();

        $this->assertTrue(
            AuditLog::query()
                ->where('auditable_type', User::class)
                ->where('auditable_id', $user->id)
                ->where('event', 'updated')
                ->exists()
        );
    }

    public function test_unauthenticated_user_cannot_change_password(): void
    {
        $response = $this->patchJson('/api/auth/password', [
            'current_password' => 'password-actual',
            'password' => 'password-nueva',
            'password_confirmation' => 'password-nueva',
        ]);

        $response->assertStatus(401);
    }

    public function test_change_password_fails_if_current_password_is_incorrect(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'password' => 'password-actual',
        ]);
        $token = $user->createToken('test-token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->patchJson('/api/auth/password', [
                'current_password' => 'password-incorrecta',
                'password' => 'password-nueva',
                'password_confirmation' => 'password-nueva',
            ]);

        $response->assertStatus(422)
            ->assertJson([
                'message' => 'La contrasena actual no coincide.',
            ]);

        Notification::assertNothingSent();
        $this->assertTrue(Hash::check('password-actual', $user->fresh()->password));
    }

    public function test_change_password_fails_if_new_password_is_not_confirmed(): void
    {
        $user = User::factory()->create([
            'password' => 'password-actual',
        ]);
        $token = $user->createToken('test-token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->patchJson('/api/auth/password', [
                'current_password' => 'password-actual',
                'password' => 'password-nueva',
                'password_confirmation' => 'otra-password',
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['password']);

        $this->assertTrue(Hash::check('password-actual', $user->fresh()->password));
    }

    public function test_change_password_fails_if_new_password_is_same_as_current(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'password' => 'password-actual',
        ]);
        $token = $user->createToken('test-token')->plainTextToken;

        $response = $this->withHeader('Authorization', 'Bearer '.$token)
            ->patchJson('/api/auth/password', [
                'current_password' => 'password-actual',
                'password' => 'password-actual',
                'password_confirmation' => 'password-actual',
            ]);

        $response->assertStatus(422)
            ->assertJson([
                'message' => 'La nueva contrasena no puede ser igual a la actual.',
            ]);

        Notification::assertNothingSent();
        $this->assertTrue(Hash::check('password-actual', $user->fresh()->password));
    }

    public function test_old_password_no_longer_allows_login_after_password_change(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'old-password-login@incidencias.local',
            'password' => 'password-actual',
            'is_active' => true,
        ]);
        $token = $user->createToken('test-token')->plainTextToken;

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->patchJson('/api/auth/password', [
                'current_password' => 'password-actual',
                'password' => 'password-nueva',
                'password_confirmation' => 'password-nueva',
            ])
            ->assertOk();

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password-actual',
        ])->assertStatus(401);
    }

    public function test_new_password_allows_login_after_password_change(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'new-password-login@incidencias.local',
            'password' => 'password-actual',
            'is_active' => true,
        ]);
        $token = $user->createToken('test-token')->plainTextToken;

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->patchJson('/api/auth/password', [
                'current_password' => 'password-actual',
                'password' => 'password-nueva',
                'password_confirmation' => 'password-nueva',
            ])
            ->assertOk();

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password-nueva',
        ])->assertOk();
    }

    public function test_user_can_request_password_reset_code_with_valid_email(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'forgot-valid@incidencias.local',
        ]);

        $response = $this->postJson('/api/auth/forgot-password', [
            'email' => $user->email,
        ]);

        $response->assertOk()
            ->assertJson([
                'message' => 'Si el correo esta registrado, recibiras un codigo de recuperacion.',
            ]);

        Notification::assertSentTo($user, PasswordResetCodeNotification::class);
        $this->assertDatabaseHas('auth.password_reset_tokens', [
            'email' => $user->email,
            'attempts' => 0,
            'used_at' => null,
        ]);
        $this->assertNotSame(
            '000000',
            (string) PasswordResetToken::query()->where('email', $user->email)->value('token')
        );
    }

    public function test_forgot_password_response_does_not_reveal_if_email_exists(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'existing-generic@incidencias.local',
        ]);

        $existing = $this->postJson('/api/auth/forgot-password', [
            'email' => $user->email,
        ]);

        $missing = $this->postJson('/api/auth/forgot-password', [
            'email' => 'missing-generic@incidencias.local',
        ]);

        $existing->assertOk();
        $missing->assertOk();
        $this->assertSame($existing->json('message'), $missing->json('message'));
        Notification::assertSentTo($user, PasswordResetCodeNotification::class);
    }

    public function test_correct_password_reset_code_allows_password_change(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'reset-correct@incidencias.local',
            'password' => 'password-actual',
            'is_active' => true,
        ]);
        $code = $this->requestPasswordResetCode($user);

        $this->postJson('/api/auth/password/verify-code', [
            'email' => $user->email,
            'code' => $code,
        ])->assertOk();

        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'password-nueva',
            'password_confirmation' => 'password-nueva',
        ])->assertOk()
            ->assertJson([
                'message' => 'Contrasena restablecida correctamente.',
            ]);

        $this->assertTrue(Hash::check('password-nueva', $user->fresh()->password));
        Notification::assertSentTo($user, PasswordResetCompletedNotification::class);
    }

    public function test_incorrect_password_reset_code_does_not_allow_password_change(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'reset-incorrect@incidencias.local',
            'password' => 'password-actual',
        ]);
        $code = $this->requestPasswordResetCode($user);
        $wrongCode = $code === '123456' ? '654321' : '123456';

        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'code' => $wrongCode,
            'password' => 'password-nueva',
            'password_confirmation' => 'password-nueva',
        ])->assertStatus(422)
            ->assertJson([
                'message' => 'El codigo de recuperacion es invalido o expiro.',
            ]);

        $this->assertTrue(Hash::check('password-actual', $user->fresh()->password));
        $this->assertSame(1, (int) PasswordResetToken::query()->where('email', $user->email)->value('attempts'));
    }

    public function test_expired_password_reset_code_does_not_allow_password_change(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'reset-expired@incidencias.local',
            'password' => 'password-actual',
        ]);
        $code = $this->requestPasswordResetCode($user);

        PasswordResetToken::query()
            ->where('email', $user->email)
            ->update(['expires_at' => now()->subMinute()]);

        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'password-nueva',
            'password_confirmation' => 'password-nueva',
        ])->assertStatus(422);

        $this->assertTrue(Hash::check('password-actual', $user->fresh()->password));
    }

    public function test_used_password_reset_code_cannot_be_reused(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'reset-used@incidencias.local',
            'password' => 'password-actual',
        ]);
        $code = $this->requestPasswordResetCode($user);

        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'password-nueva',
            'password_confirmation' => 'password-nueva',
        ])->assertOk();

        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'otra-password',
            'password_confirmation' => 'otra-password',
        ])->assertStatus(422);

        $this->assertTrue(Hash::check('password-nueva', $user->fresh()->password));
    }

    public function test_old_password_no_longer_allows_login_after_password_reset(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'reset-old-login@incidencias.local',
            'password' => 'password-actual',
            'is_active' => true,
        ]);
        $code = $this->requestPasswordResetCode($user);

        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'password-nueva',
            'password_confirmation' => 'password-nueva',
        ])->assertOk();

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password-actual',
        ])->assertStatus(401);
    }

    public function test_new_password_allows_login_after_password_reset(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'reset-new-login@incidencias.local',
            'password' => 'password-actual',
            'is_active' => true,
        ]);
        $code = $this->requestPasswordResetCode($user);

        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'password-nueva',
            'password_confirmation' => 'password-nueva',
        ])->assertOk();

        $this->postJson('/api/login', [
            'email' => $user->email,
            'password' => 'password-nueva',
        ])->assertOk();
    }

    public function test_previous_tokens_are_revoked_after_password_reset(): void
    {
        Notification::fake();

        $user = User::factory()->create([
            'email' => 'reset-revoke-tokens@incidencias.local',
            'password' => 'password-actual',
        ]);
        $token = $user->createToken('existing-token')->plainTextToken;
        $code = $this->requestPasswordResetCode($user);

        $this->postJson('/api/auth/reset-password', [
            'email' => $user->email,
            'code' => $code,
            'password' => 'password-nueva',
            'password_confirmation' => 'password-nueva',
        ])->assertOk();

        Auth::forgetGuards();

        $this->withHeader('Authorization', 'Bearer '.$token)
            ->getJson('/api/me')
            ->assertUnauthorized();
    }

    private function requestPasswordResetCode(User $user): string
    {
        $code = null;

        $this->postJson('/api/auth/forgot-password', [
            'email' => $user->email,
        ])->assertOk();

        Notification::assertSentTo(
            $user,
            PasswordResetCodeNotification::class,
            function (PasswordResetCodeNotification $notification) use (&$code): bool {
                $code = $notification->code;

                return preg_match('/^\d{6}$/', $code) === 1;
            }
        );

        $this->assertIsString($code);

        return $code;
    }
}
