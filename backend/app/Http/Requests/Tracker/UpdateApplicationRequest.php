<?php

namespace App\Http\Requests\Tracker;

use App\Http\Concerns\GuardsApplicationOwnership;

/**
 * Patching an application. Every field is optional; whatever is sent is
 * validated, and whatever is not is left alone.
 */
class UpdateApplicationRequest extends ApplicationRequest
{
    use GuardsApplicationOwnership;

    /**
     * Ownership is settled here rather than in the controller so a malformed
     * body cannot draw a 422 out of a record that should be a 404.
     */
    public function authorize(): bool
    {
        $this->guardApplicationOwnership($this->route('application'), $this->user());

        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return array_merge($this->sharedRules(), [
            'company' => ['sometimes', 'required', 'string', 'max:255'],
            'role' => ['sometimes', 'required', 'string', 'max:255'],
        ]);
    }
}
