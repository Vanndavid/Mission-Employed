<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The admin deactivate / reactivate switch. Authorization is the `admin`
 * middleware on the route, not this request.
 */
class UpdateUserActiveRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'active' => ['required', 'boolean'],
        ];
    }

    public function active(): bool
    {
        return $this->boolean('active');
    }
}
