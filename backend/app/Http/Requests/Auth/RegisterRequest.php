<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

/**
 * Registration rules ported from registerUser() in the retired server/auth.js:
 * a valid email that is not already taken, and a password of at least 8
 * characters. The hand-rolled checks there become validation rules here.
 */
class RegisterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * normalizeEmail() in server/usersStore.js trimmed and lowercased before
     * both the duplicate check and storage, so "Sam@Example.com" and
     * "sam@example.com" were one account. Do the same here, before the unique
     * rule runs, or the same address could register twice in different cases.
     */
    protected function prepareForValidation(): void
    {
        $email = $this->input('email');

        if (is_string($email)) {
            $this->merge(['email' => Str::lower(trim($email))]);
        }
    }

    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'email.unique' => 'That email is already registered.',
            'password.min' => 'Password must be at least 8 characters.',
        ];
    }
}
