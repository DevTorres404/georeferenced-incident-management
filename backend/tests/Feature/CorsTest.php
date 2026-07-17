<?php

namespace Tests\Feature;

use Tests\TestCase;

class CorsTest extends TestCase
{
    public function test_preflight_response_allows_a_configured_origin(): void
    {
        config()->set('cors.allowed_origins', [
            'https://frontend.example.com',
            'http://localhost:5500',
        ]);

        $response = $this->withHeaders([
            'Origin' => 'http://localhost:5500',
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'Authorization, Content-Type',
        ])->options('/api/login');

        $response->assertNoContent()
            ->assertHeader('Access-Control-Allow-Origin', 'http://localhost:5500')
            ->assertHeader('Access-Control-Allow-Methods', 'POST')
            ->assertHeaderMissing('Access-Control-Allow-Credentials');
    }

    public function test_preflight_response_rejects_an_unknown_origin(): void
    {
        config()->set('cors.allowed_origins', [
            'https://frontend.example.com',
            'http://localhost:5500',
        ]);

        $response = $this->withHeaders([
            'Origin' => 'https://attacker.example.com',
            'Access-Control-Request-Method' => 'GET',
        ])->options('/api/incidents');

        $response->assertNoContent()
            ->assertHeaderMissing('Access-Control-Allow-Origin');
    }

    public function test_origin_configuration_is_normalized_and_deduplicated(): void
    {
        $config = $this->loadCorsConfig(
            ' https://FRONTEND.example.com/, https://frontend.example.com:443, http://localhost:5500, '
        );

        $this->assertSame([
            'https://frontend.example.com',
            'http://localhost:5500',
        ], $config['allowed_origins']);
    }

    public function test_empty_and_malformed_entries_do_not_enable_a_wildcard_fallback(): void
    {
        $config = $this->loadCorsConfig(
            ' , *, invalid, https://*.example.com, ftp://frontend.example.com, '
            .'https://user@example.com, https://example.com/path '
        );

        $this->assertSame([], $config['allowed_origins']);
        $this->assertNotContains('*', $config['allowed_origins']);
    }

    private function loadCorsConfig(string $origins): array
    {
        $previous = getenv('CORS_ALLOWED_ORIGINS');
        putenv("CORS_ALLOWED_ORIGINS={$origins}");

        try {
            return require config_path('cors.php');
        } finally {
            $previous === false
                ? putenv('CORS_ALLOWED_ORIGINS')
                : putenv("CORS_ALLOWED_ORIGINS={$previous}");
        }
    }
}
