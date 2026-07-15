<?php

namespace App\Incidents\Infrastructure\Storage;

use App\Shared\Application\DTOs\StoredFileData;
use App\Shared\Application\DTOs\UploadedFileData;
use App\Shared\Application\Ports\FileStoragePort;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

final class LaravelFileStorageAdapter implements FileStoragePort
{
    public function storeIncidentFile(int $incidentId, UploadedFileData $fileData): StoredFileData
    {
        $extension = $this->extensionFromMime($fileData->mimeType);
        $fileName = Str::uuid()->toString().($extension ? '.'.$extension : '');
        $storagePath = "incidents/{$incidentId}/{$fileName}";
        $contents = file_get_contents($fileData->temporaryPath);

        if ($contents === false) {
            throw new \RuntimeException('No se pudo leer el file temporal.');
        }

        Storage::disk($this->incidentDisk())->put($storagePath, $contents);

        return new StoredFileData(
            originalName: $fileData->originalName,
            storagePath: $storagePath,
            mimeType: $fileData->mimeType,
            sizeInBytes: $fileData->sizeInBytes,
            hash: hash_file('sha256', $fileData->temporaryPath)
        );
    }

    private function incidentDisk(): string
    {
        return (string) config('filesystems.incident_disk', 'public');
    }

    private function extensionFromMime(string $mimeType): string
    {
        $map = [
            'image/jpeg' => 'jpg',
            'image/png' => 'png',
            'image/gif' => 'gif',
            'image/webp' => 'webp',
            'application/pdf' => 'pdf',
        ];

        return $map[$mimeType] ?? '';
    }
}
