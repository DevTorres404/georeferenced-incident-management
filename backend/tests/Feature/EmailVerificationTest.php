<?php

namespace Tests\Feature;

use App\Auth\Infrastructure\Notifications\VerifyEmailNotification;
use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\URL;
use Tests\TestCase;

class EmailVerificationTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        URL::forceScheme(null);
        URL::forceRootUrl(null);

        parent::tearDown();
    }

    public function test_verification_email_contains_production_https_signed_url(): void
    {
        $user = $this->unverifiedUser();
        $verificationUrl = $this->productionVerificationUrl($user);
        $query = [];
        parse_str((string) parse_url($verificationUrl, PHP_URL_QUERY), $query);

        $this->assertStringStartsWith(
            "https://api.labtorres.me/api/auth/email/verify/{$user->id}/",
            $verificationUrl,
        );
        $this->assertSame('https', parse_url($verificationUrl, PHP_URL_SCHEME));
        $this->assertSame('api.labtorres.me', parse_url($verificationUrl, PHP_URL_HOST));
        $this->assertArrayHasKey('expires', $query);
        $this->assertArrayHasKey('signature', $query);
        $this->assertNotSame('', $query['signature']);
    }

    public function test_https_signed_link_is_valid_behind_trusted_http_proxy(): void
    {
        $user = $this->unverifiedUser();
        $verificationUrl = $this->productionVerificationUrl($user);
        $requestTarget = parse_url($verificationUrl, PHP_URL_PATH)
            .'?'.parse_url($verificationUrl, PHP_URL_QUERY);

        $response = $this
            ->withServerVariables([
                'REMOTE_ADDR' => '172.18.0.10',
                'SERVER_PORT' => 80,
                'HTTPS' => 'off',
            ])
            ->withHeaders([
                'Host' => 'api.labtorres.me',
                'X-Forwarded-For' => '203.0.113.10',
                'X-Forwarded-Host' => 'api.labtorres.me',
                'X-Forwarded-Port' => '443',
                'X-Forwarded-Proto' => 'https',
            ])
            ->get($requestTarget);

        $response->assertRedirect();
        $this->assertNotNull($user->fresh()->email_verified_at);
    }

    private function productionVerificationUrl(User $user): string
    {
        config()->set('app.url', 'https://api.labtorres.me');
        URL::forceRootUrl('https://api.labtorres.me');
        URL::forceScheme('https');

        $mail = (new VerifyEmailNotification)->toMail($user);

        return (string) $mail->viewData['actionUrl'];
    }

    private function unverifiedUser(): User
    {
        return User::factory()->create([
            'email' => 'verify-production@labtorres.me',
            'email_verified_at' => null,
            'is_active' => true,
        ]);
    }
}
