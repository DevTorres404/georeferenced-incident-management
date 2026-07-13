<?php

declare(strict_types=1);

namespace Tests\Unit\Auth;

use App\Auth\Infrastructure\Storage\RustFsProfilePhotoStorageAdapter;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

final class RustFsProfilePhotoStorageAdapterTest extends TestCase
{
    public function test_it_stores_a_long_google_profile_photo_url_as_a_short_rustfs_path(): void
    {
        Storage::fake('rustfs');
        Http::fake([
            'https://lh3.googleusercontent.com/*' => Http::response(
                'fake-google-avatar',
                200,
                ['Content-Type' => 'image/jpeg']
            ),
        ]);

        $providerUid = 'firebase-google-uid-001';
        $sourceUrl = 'https://lh3.googleusercontent.com/a-/'.str_repeat('a', 600).'=s96-c';

        $storagePath = app(RustFsProfilePhotoStorageAdapter::class)
            ->storeGoogleProfilePhoto($sourceUrl, $providerUid);

        $expectedPath = 'profile-photos/google/'.hash('sha256', $providerUid).'.jpg';
        $this->assertSame($expectedPath, $storagePath);
        $this->assertLessThanOrEqual(255, strlen($storagePath));
        Storage::disk('rustfs')->assertExists($expectedPath);
        $this->assertSame('fake-google-avatar', Storage::disk('rustfs')->get($expectedPath));
    }

    public function test_it_rejects_non_google_profile_photo_hosts(): void
    {
        Http::preventStrayRequests();

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('La URL de la foto de Google no es valida.');

        app(RustFsProfilePhotoStorageAdapter::class)
            ->storeGoogleProfilePhoto('https://example.com/avatar.jpg', 'provider-uid');
    }
}
