<?php

namespace App\Incidents\Infrastructure\Http\Requests;

use App\Incidents\Infrastructure\Persistence\Models\Category;
use App\Incidents\Infrastructure\Persistence\Models\Subcategory;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

final class ClassifyIncidentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'category_id' => [
                'required',
                'integer',
                Rule::exists(Category::class, 'id')
                    ->where('is_active', true),
            ],
            'subcategory_id' => [
                'nullable',
                'integer',
                Rule::exists(Subcategory::class, 'id')->where('is_active', true),
            ],
            'reason' => ['required', 'string', 'min:10', 'max:1000'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator): void {
                $categoryId = (int) $this->input('category_id');
                $subcategoryId = $this->input('subcategory_id');
                $category = Category::query()->find($categoryId);

                if ($category?->is_fallback) {
                    $validator->errors()->add(
                        'category_id',
                        'Selecciona una categoría definitiva.'
                    );
                }

                $hasSubcategories = Subcategory::query()
                    ->where('category_id', $categoryId)
                    ->where('is_active', true)
                    ->exists();

                if ($hasSubcategories && ($subcategoryId === null || $subcategoryId === '')) {
                    $validator->errors()->add('subcategory_id', 'Selecciona una subcategoría definitiva.');

                    return;
                }

                if ($subcategoryId !== null && $subcategoryId !== '' && ! Subcategory::query()
                    ->whereKey((int) $subcategoryId)
                    ->where('category_id', $categoryId)
                    ->where('is_active', true)
                    ->exists()) {
                    $validator->errors()->add(
                        'subcategory_id',
                        'La subcategoría seleccionada no pertenece a la categoría.'
                    );
                }
            },
        ];
    }
}
