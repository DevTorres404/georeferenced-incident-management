<?php

declare(strict_types=1);

namespace App\Auth\Infrastructure\Http\Requests;

use App\Auth\Infrastructure\Persistence\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Rules\File;
use LogicException;

final class UpdateProfilePhotoRequest extends FormRequest
{
    private const MAX_FILE_SIZE_KILOBYTES = 5 * 1024;

    public function authorize(): bool
    {
        return $this->user() instanceof User;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'photo' => [
                'required',
                File::image()->max(self::MAX_FILE_SIZE_KILOBYTES),
                File::types(['jpg', 'jpeg', 'png', 'webp']),
                'extensions:jpg,jpeg,png,webp',
            ],
        ];
    }

    public function photo(): UploadedFile
    {
        $photo = $this->file('photo');
        if (! $photo instanceof UploadedFile) {
            throw new LogicException('The validated profile photo is unavailable.');
        }

        return $photo;
    }
}
