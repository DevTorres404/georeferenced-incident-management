<?php

namespace App\Incidents\Infrastructure\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ReopenIncidentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'reopening_reason' => ['required', 'string', 'min:10', 'max:2000'],
        ];
    }
}
