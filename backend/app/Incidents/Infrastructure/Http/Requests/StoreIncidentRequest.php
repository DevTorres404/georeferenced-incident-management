<?php

namespace App\Incidents\Infrastructure\Http\Requests;

use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Priority;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use App\TerritorialUnits\Infrastructure\Persistence\Models\TerritorialUnit;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

final class StoreIncidentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $canSetPriority = (bool) $this->user()?->tieneRol('ADMIN')
            || (bool) $this->user()?->tieneRol('SUPERVISOR');

        return [
            'title' => ['required', 'string', 'max:200'],
            'description' => ['required', 'string'],
            'category_id' => [
                'required',
                'integer',
                Rule::exists(Category::class, 'id')->where('is_active', true),
            ],
            'subcategory_id' => [
                'nullable',
                'integer',
                Rule::exists(Subcategory::class, 'id')->where('is_active', true),
            ],
            'classification_detail' => ['nullable', 'string', 'min:10', 'max:1000'],
            'priority_id' => $canSetPriority
                ? ['nullable', 'integer', Rule::exists(Priority::class, 'id')]
                : ['prohibited'],
            'state_id' => ['prohibited'],
            'territorial_unit_id' => [
                'nullable',
                'integer',
                Rule::exists(TerritorialUnit::class, 'id')->where('is_active', true),
            ],
            'address' => ['nullable', 'string', 'max:500'],
            'address_reference' => ['nullable', 'string', 'max:500'],
            'latitude' => ['nullable', 'numeric', 'between:-5.5,2.0'],
            'longitude' => ['nullable', 'numeric', 'between:-92.5,-75.0'],
            'resolution_date' => ['nullable', 'date'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $categoryId = (int) $this->input('category_id');
                $subcategoryId = $this->input('subcategory_id');
                $category = Category::query()->find($categoryId);

                if ($subcategoryId !== null && $subcategoryId !== '') {
                    $belongsToCategory = Subcategory::query()
                        ->whereKey((int) $subcategoryId)
                        ->where('category_id', $categoryId)
                        ->where('is_active', true)
                        ->exists();

                    if (! $belongsToCategory) {
                        $validator->errors()->add(
                            'subcategory_id',
                            'La subcategoría seleccionada no pertenece a la categoría.'
                        );
                    }
                }

                $requiresReview = (bool) $category?->is_fallback
                    || ($subcategoryId === null || $subcategoryId === '')
                    && Subcategory::query()
                        ->where('category_id', $categoryId)
                        ->where('is_active', true)
                        ->exists();

                if ($requiresReview && mb_strlen(trim((string) $this->input('classification_detail'))) < 10) {
                    $validator->errors()->add(
                        'classification_detail',
                        'Describe el tipo de problema para que un supervisor pueda clasificarlo.'
                    );
                }
            },
        ];
    }
}
