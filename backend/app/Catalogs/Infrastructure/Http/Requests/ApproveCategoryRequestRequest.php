<?php

declare(strict_types=1);

namespace App\Catalogs\Infrastructure\Http\Requests;

use App\Incidents\Infrastructure\Persistence\Models\Category;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class ApproveCategoryRequestRequest extends FormRequest
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
            'category_name' => [
                'required',
                'string',
                'min:3',
                'max:100',
                Rule::unique(Category::class, 'name'),
            ],
            'subcategory_name' => ['required', 'string', 'min:3', 'max:100'],
            'category_description' => ['nullable', 'string', 'max:255'],
            'subcategory_description' => ['nullable', 'string', 'max:255'],
            'icon' => ['required', 'string', 'max:50', 'regex:/^fa-[a-z0-9-]+$/'],
            'color' => ['required', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'admin_comment' => ['nullable', 'string', 'max:500'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $normalized = [];

        foreach (['category_name', 'subcategory_name'] as $field) {
            if ($this->has($field) && is_string($this->input($field))) {
                $normalized[$field] = trim((string) preg_replace('/\s+/u', ' ', $this->input($field)));
            }
        }

        if ($normalized !== []) {
            $this->merge($normalized);
        }
    }
}
