<?php

declare(strict_types=1);

namespace App\Catalogs\Infrastructure\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class StoreCategoryRequestRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->roles()
            ->where('code', 'SUPERVISOR')
            ->where('is_active', true)
            ->exists() ?? false;
    }

    public function rules(): array
    {
        return [
            'suggested_category_name' => ['required', 'string', 'min:3', 'max:100'],
            'suggested_category_description' => ['required', 'string', 'min:10', 'max:255'],
            'suggested_subcategory_name' => ['required', 'string', 'min:3', 'max:100'],
            'suggested_icon' => ['nullable', 'string', 'max:50', 'regex:/^fa-[a-z0-9-]+$/'],
            'reason' => ['required', 'string', 'min:10', 'max:500'],
        ];
    }
}
