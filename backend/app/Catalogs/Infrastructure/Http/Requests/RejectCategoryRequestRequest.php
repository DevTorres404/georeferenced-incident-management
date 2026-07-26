<?php

declare(strict_types=1);

namespace App\Catalogs\Infrastructure\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class RejectCategoryRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->roles()
            ->where('code', 'ADMIN')
            ->where('is_active', true)
            ->exists() ?? false;
    }

    public function rules(): array
    {
        return [
            'comment' => ['required', 'string', 'min:10', 'max:500'],
        ];
    }
}
