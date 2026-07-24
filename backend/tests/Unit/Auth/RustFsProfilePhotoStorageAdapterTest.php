<?php

declare(strict_types=1);

namespace Tests\Unit\Auth;

use App\Auth\Infrastructure\Storage\RustFsProfilePhotoStorageAdapter;
use App\Shared\Application\DTOs\UploadedFileData;
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

    public function test_it_stores_reads_and_deletes_uploaded_profile_photo(): void
    {
        Storage::fake('rustfs');

        $tmpFile = tempnam(sys_get_temp_dir(), 'test_photo');
        file_put_contents($tmpFile, 'fake-photo-content');

        $adapter = app(RustFsProfilePhotoStorageAdapter::class);
        $fileData = new UploadedFileData(
            originalName: 'avatar.jpg',
            mimeType: 'image/jpeg',
            sizeInBytes: strlen('fake-photo-content'),
            temporaryPath: $tmpFile
        );

        $storagePath = $adapter->storeUploadedProfilePhoto(1, $fileData);
        $this->assertStringStartsWith('profile-photos/users/1/', $storagePath);

        $contentData = $adapter->read($storagePath);
        $this->assertNotNull($contentData);
        $this->assertSame('fake-photo-content', $contentData->contents);
        $this->assertSame('image/jpeg', $contentData->mimeType);

        $adapter->delete($storagePath);
        $this->assertNull($adapter->read($storagePath));

        @unlink($tmpFile);
    }

    public function test_it_returns_null_for_unmanaged_or_missing_paths(): void
    {
        Storage::fake('rustfs');
        $adapter = app(RustFsProfilePhotoStorageAdapter::class);

        $this->assertNull($adapter->read('unmanaged/path.jpg'));
        $this->assertNull($adapter->read('profile-photos/users/99/missing.jpg'));

        $adapter->delete(null);
        $adapter->delete('unmanaged/path.jpg');
    }

    public function test_it_rejects_invalid_upload_mime_types(): void
    {
        $tmpFile = tempnam(sys_get_temp_dir(), 'test_invalid');
        file_put_contents($tmpFile, 'some text');

        $adapter = app(RustFsProfilePhotoStorageAdapter::class);
        $fileData = new UploadedFileData(
            originalName: 'doc.pdf',
            mimeType: 'application/pdf',
            sizeInBytes: strlen('some text'),
            temporaryPath: $tmpFile
        );

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('La foto de perfil tiene un formato o tamano no permitido.');

        try {
            $adapter->storeUploadedProfilePhoto(1, $fileData);
        } finally {
            @unlink($tmpFile);
        }
    }
}
