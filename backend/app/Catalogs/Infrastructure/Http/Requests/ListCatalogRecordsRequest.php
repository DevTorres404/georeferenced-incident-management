<?php

declare(strict_types=1);

namespace App\Catalogs\Infrastructure\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class ListCatalogRecordsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }

    public function perPage(): int
    {
        return (int) ($this->validated('per_page') ?? 50);
    }

    public function isActive(): ?bool
    {
        $value = $this->validated('is_active');

        return $value === null ? null : (bool) $value;
    }
}
