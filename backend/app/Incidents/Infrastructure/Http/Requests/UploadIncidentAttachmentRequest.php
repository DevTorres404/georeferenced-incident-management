<?php

declare(strict_types=1);

namespace App\Incidents\Infrastructure\Http\Requests;

use App\Auth\Infrastructure\Persistence\Models\User;
use App\Incidents\Infrastructure\Persistence\Models\Incident;
use App\Shared\Infrastructure\Authorization\IncidentAccessChecker;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Rules\File;
use LogicException;

final class UploadIncidentAttachmentRequest extends FormRequest
{
    private const MAX_FILE_SIZE_KILOBYTES = 50 * 1024;

    public function authorize(IncidentAccessChecker $accessChecker): bool
    {
        $user = $this->user();
        $incident = $this->route('incident');

        return $user instanceof User
            && $incident instanceof Incident
            && $accessChecker->canView($user, $incident);
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'file' => [
                'required',
                File::default()->max(self::MAX_FILE_SIZE_KILOBYTES),
                File::types(['jpg', 'jpeg', 'png', 'webp', 'mp4', 'webm']),
                'extensions:jpg,jpeg,png,webp,mp4,webm',
            ],
        ];
    }

    public function authenticatedUser(): User
    {
        $user = $this->user();

        if (! $user instanceof User) {
            throw new LogicException('The attachment request is not authenticated.');
        }

        return $user;
    }

    public function attachment(): UploadedFile
    {
        $file = $this->file('file');

        if (! $file instanceof UploadedFile) {
            throw new LogicException('The validated attachment is unavailable.');
        }

        return $file;
    }
}
