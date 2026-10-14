<?php

namespace App\Http\Requests\Auth;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A partial save of the signed-in user's preferences. Only the keys listed
 * here are stored; anything else in the body is dropped by validated().
 */
class UpdatePreferencesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'applicationsPageSize' => ['sometimes', 'integer', Rule::in(User::APPLICATIONS_PAGE_SIZES)],
        ];
    }

    /**
     * The validated keys, typed. `integer` also passes "25", which would
     * otherwise be stored as a string and fail the strict check in
     * User::effectivePreferences().
     *
     * @return array<string, int>
     */
    public function preferences(): array
    {
        return array_map(intval(...), $this->validated());
    }
}
