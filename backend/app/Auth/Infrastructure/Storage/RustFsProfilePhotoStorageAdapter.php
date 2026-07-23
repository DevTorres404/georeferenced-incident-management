<?php

declare(strict_types=1);

namespace App\Auth\Infrastructure\Storage;

use App\Auth\Application\DTOs\ProfilePhotoContentData;
use App\Auth\Application\Ports\ProfilePhotoStoragePort;
use App\Shared\Application\DTOs\UploadedFileData;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

final class RustFsProfilePhotoStorageAdapter implements ProfilePhotoStoragePort
{
    private const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

    /** @var array<string, string> */
    private const ALLOWED_MIME_TYPES = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];

    public function storeGoogleProfilePhoto(string $sourceUrl, string $providerUid): string
    {
        $this->assertAllowedGoogleUrl($sourceUrl);

        $response = Http::accept('image/*')
            ->connectTimeout(3)
            ->timeout(8)
            ->retry(2, 200, throw: false)
            ->get($sourceUrl);

        $this->assertValidImageResponse($response);

        $contents = $response->body();
        $mimeType = strtolower(trim(explode(';', (string) $response->header('Content-Type'))[0]));
        $extension = self::ALLOWED_MIME_TYPES[$mimeType];
        $storagePath = sprintf(
            'profile-photos/google/%s.%s',
            hash('sha256', $providerUid),
            $extension
        );

        $stored = Storage::disk($this->profilePhotoDisk())->put($storagePath, $contents, [
            'ContentType' => $mimeType,
            'visibility' => 'private',
        ]);

        if (! $stored) {
            throw new RuntimeException('No se pudo almacenar la foto de perfil en RustFS.');
        }

        return $storagePath;
    }

    public function storeUploadedProfilePhoto(int $userId, UploadedFileData $fileData): string
    {
        $extension = self::ALLOWED_MIME_TYPES[$fileData->mimeType] ?? null;
        if ($extension === null || $fileData->sizeInBytes <= 0 || $fileData->sizeInBytes > self::MAX_FILE_SIZE_BYTES) {
            throw new RuntimeException('La foto de perfil tiene un formato o tamano no permitido.');
        }

        $contents = file_get_contents($fileData->temporaryPath);
        if ($contents === false || strlen($contents) !== $fileData->sizeInBytes) {
            throw new RuntimeException('No se pudo leer la foto de perfil.');
        }

        $storagePath = sprintf(
            'profile-photos/users/%d/%s.%s',
            $userId,
            Str::uuid()->toString(),
            $extension
        );

        $stored = Storage::disk($this->profilePhotoDisk())->put($storagePath, $contents, [
            'ContentType' => $fileData->mimeType,
            'visibility' => 'private',
        ]);

        if (! $stored) {
            throw new RuntimeException('No se pudo almacenar la foto de perfil en RustFS.');
        }

        return $storagePath;
    }

    public function read(string $storagePath): ?ProfilePhotoContentData
    {
        if (! $this->isManagedPath($storagePath)) {
            return null;
        }

        $disk = Storage::disk($this->profilePhotoDisk());
        if (! $disk->exists($storagePath)) {
            return null;
        }

        $contents = $disk->get($storagePath);
        $mimeType = $disk->mimeType($storagePath) ?: 'application/octet-stream';

        return new ProfilePhotoContentData(
            contents: $contents,
            mimeType: $mimeType,
            etag: hash('sha256', $contents)
        );
    }

    public function delete(?string $storagePath): void
    {
        if ($storagePath === null || ! $this->isManagedPath($storagePath)) {
            return;
        }

        Storage::disk($this->profilePhotoDisk())->delete($storagePath);
    }

    private function assertAllowedGoogleUrl(string $sourceUrl): void
    {
        $parts = parse_url($sourceUrl);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));
        $isGoogleHost = $host === 'googleusercontent.com'
            || str_ends_with($host, '.googleusercontent.com');

        if ($scheme !== 'https' || ! $isGoogleHost) {
            throw new RuntimeException('La URL de la foto de Google no es valida.');
        }
    }

    private function assertValidImageResponse(Response $response): void
    {
        if (! $response->successful()) {
            throw new RuntimeException('No se pudo descargar la foto de perfil de Google.');
        }

        $mimeType = strtolower(trim(explode(';', (string) $response->header('Content-Type'))[0]));
        if (! array_key_exists($mimeType, self::ALLOWED_MIME_TYPES)) {
            throw new RuntimeException('Google devolvio un formato de imagen no permitido.');
        }

        $size = strlen($response->body());
        if ($size === 0 || $size > self::MAX_FILE_SIZE_BYTES) {
            throw new RuntimeException('La foto de perfil de Google tiene un tamano no permitido.');
        }
    }

    private function profilePhotoDisk(): string
    {
        return (string) config('filesystems.profile_photo_disk', 'rustfs');
    }

    private function isManagedPath(string $storagePath): bool
    {
        return str_starts_with($storagePath, 'profile-photos/');
    }
}
