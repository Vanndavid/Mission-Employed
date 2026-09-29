<?php

namespace App\Http\Requests\Ai;

use App\Http\Concerns\GuardsApplicationOwnership;
use App\Services\Ats\AtsCheck;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AtsCheckRequest extends FormRequest
{
    use GuardsApplicationOwnership;

    /**
     * Ownership before validation, so a bad body on someone else's application
     * is a 404 like any other request for it, never a 422.
     */
    public function authorize(): bool
    {
        $this->guardApplicationOwnership($this->route('application'), $this->user());

        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // Which CV to score. Absent: the tailored CV if there is one,
            // otherwise the base CV from the profile.
            'source' => ['nullable', 'string', Rule::in(AtsCheck::SOURCES)],
        ];
    }
}
