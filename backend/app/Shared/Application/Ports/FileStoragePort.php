<?php

namespace App\Shared\Application\Ports;

use App\Shared\Application\DTOs\StoredFileData;
use App\Shared\Application\DTOs\UploadedFileData;

interface FileStoragePort
{
    public function storeIncidentFile(int $incidentId, UploadedFileData $fileData): StoredFileData;
}
