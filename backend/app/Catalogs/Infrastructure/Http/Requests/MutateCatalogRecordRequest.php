<?php

declare(strict_types=1);

namespace App\Catalogs\Infrastructure\Http\Requests;

use App\Auth\Infrastructure\Persistence\Models\Role;
use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Configuration;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\State;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

final class MutateCatalogRecordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->roles()
            ->where('code', 'ADMIN')
            ->where('is_active', true)
            ->exists() ?? false;
    }

    protected function prepareForValidation(): void
    {
        $normalized = [];

        foreach (['name', 'icon'] as $field) {
            if ($this->has($field) && is_string($this->input($field))) {
                $normalized[$field] = trim((string) preg_replace('/\s+/u', ' ', $this->input($field)));
            }
        }

        if ($this->has('description') && is_string($this->input('description'))) {
            $normalized['description'] = trim($this->input('description'));
        }

        if ($normalized !== []) {
            $this->merge($normalized);
        }
    }

    public function rules(): array
    {
        $catalog = (string) $this->route('catalog');
        $id = $this->route('id') !== null ? (int) $this->route('id') : null;

        return match ($catalog) {
            'categories' => [
                'name' => [
                    'required',
                    'string',
                    'min:3',
                    'max:100',
                    Rule::unique(Category::class, 'name')->ignore($id),
                ],
                'description' => ['nullable', 'string', 'max:255'],
                'icon' => ['nullable', 'string', 'max:50', 'regex:/^fa-[a-z0-9-]+$/'],
                'color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
                'is_active' => ['sometimes', 'boolean'],
            ],
            'subcategories' => [
                'category_id' => ['required', 'integer', Rule::exists(Category::class, 'id')],
                'name' => [
                    'required',
                    'string',
                    'min:3',
                    'max:100',
                    Rule::unique(Subcategory::class, 'name')
                        ->where('category_id', $this->integer('category_id'))
                        ->ignore($id),
                ],
                'description' => ['nullable', 'string', 'max:255'],
                'is_active' => ['sometimes', 'boolean'],
            ],
            'priorities' => [
                'name' => ['required', 'string', 'max:50'],
                'level' => ['required', 'integer', 'min:1', 'max:10', Rule::unique(Priority::class, 'level')->ignore($id)],
                'color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
                'sla_hours' => ['required', 'integer', 'min:1'],
                'weight' => ['required', 'integer', 'min:1', 'max:999'],
                'is_active' => ['sometimes', 'boolean'],
            ],
            'states' => [
                'name' => ['required', 'string', 'max:50', Rule::unique(State::class, 'name')->ignore($id)],
                'description' => ['nullable', 'string', 'max:255'],
                'color' => ['nullable', 'regex:/^#[0-9A-Fa-f]{6}$/'],
                'is_initial_state' => ['sometimes', 'boolean'],
                'is_final_state' => ['sometimes', 'boolean'],
                'allows_edition' => ['sometimes', 'boolean'],
                'order' => ['sometimes', 'integer'],
                'is_active' => ['sometimes', 'boolean'],
            ],
            'transitions' => [
                'source_state_id' => ['required', 'integer', Rule::exists(State::class, 'id')],
                'target_state_id' => ['required', 'integer', Rule::exists(State::class, 'id')],
                'requires_comment' => ['sometimes', 'boolean'],
                'allowed_roles' => ['nullable', 'array'],
                'allowed_roles.*' => ['string', Rule::exists(Role::class, 'code')],
                'is_active' => ['sometimes', 'boolean'],
            ],
            'configuraciones' => [
                'clave' => ['required', 'string', 'max:100', Rule::unique(Configuration::class, 'clave')->ignore($id)],
                'valor' => ['required', 'string'],
                'tipo' => ['required', Rule::in(['string', 'integer', 'boolean', 'json'])],
                'description' => ['nullable', 'string', 'max:255'],
            ],
            default => [],
        };
    }
}
