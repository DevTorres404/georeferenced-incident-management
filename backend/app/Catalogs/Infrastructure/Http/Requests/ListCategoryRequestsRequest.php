<?php

declare(strict_types=1);

namespace App\Catalogs\Infrastructure\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class ListCategoryRequestsRequest extends FormRequest
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
        return [];
    }
}
