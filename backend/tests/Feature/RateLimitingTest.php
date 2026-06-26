<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class RateLimitingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        // Limpiamos los rate limiters para evitar interferencias entre pruebas
        RateLimiter::clear('login');
        RateLimiter::clear('register');
        RateLimiter::clear('api');
        RateLimiter::clear('catalogs.public');
        RateLimiter::clear('incidents.store');
        RateLimiter::clear('uploads');
    }

    public function test_login_rate_limiting_returns_429_with_custom_json()
    {
        // 5 peticiones permitidas por minuto
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', [
                'email' => 'test@example.com',
                'password' => 'password123'
            ]);
        }

        // La sexta debe fallar
        $response = $this->postJson('/api/login', [
            'email' => 'test@example.com',
            'password' => 'password123'
        ]);

        $response->assertStatus(429)
                 ->assertJson([
                     'message' => 'Has realizado demasiadas solicitudes. Intenta nuevamente más tarde.',
                     'code' => 'RATE_LIMIT_EXCEEDED'
                 ]);
    }

    public function test_register_rate_limiting_returns_429()
    {
        // 3 peticiones permitidas por hora
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/register', [
                'name' => 'Test User',
                'email' => 'test@example.com',
                'password' => 'password123',
                'password_confirmation' => 'password123'
            ]);
        }

        // La cuarta debe fallar
        $response = $this->postJson('/api/register', [
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123'
        ]);

        $response->assertStatus(429);
    }

    public function test_incidents_store_rate_limiting()
    {
        $user = User::factory()->create();

        // 10 peticiones permitidas por minuto
        for ($i = 0; $i < 10; $i++) {
            $this->actingAs($user)->postJson('/api/incidents', []);
        }

        // La 11va debe fallar con 429
        $response = $this->actingAs($user)->postJson('/api/incidents', []);
        $response->assertStatus(429);
    }

    public function test_incident_attachments_rate_limiting()
    {
        $user = User::factory()->create();

        // 20 peticiones permitidas por minuto
        for ($i = 0; $i < 20; $i++) {
            $this->actingAs($user)->postJson('/api/incidents/1/attachments', []);
        }

        // La 21va debe fallar con 429
        $response = $this->actingAs($user)->postJson('/api/incidents/1/attachments', []);
        $response->assertStatus(429);
    }
}
