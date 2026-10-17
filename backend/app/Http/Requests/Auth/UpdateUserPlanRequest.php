<?php

namespace App\Http\Requests\Auth;

use App\Enums\AccountPlan;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * The admin plan switch. Authorization is the `admin` middleware on the route,
 * not this request; all this does is keep the column inside the AccountPlan
 * enum and the end date in the future. There is no payment integration — an
 * admin upgrades a user by hand, for good or until a date.
 */
class UpdateUserPlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'plan' => ['required', 'string', Rule::in(AccountPlan::values())],
            // Premium only; null or absent means no end date.
            'expiresAt' => ['sometimes', 'nullable', 'date', 'after:now'],
        ];
    }

    public function expiresAt(): ?Carbon
    {
        $expiresAt = $this->validated('expiresAt');

        return $expiresAt === null ? null : Carbon::parse($expiresAt);
    }

    public function plan(): AccountPlan
    {
        return AccountPlan::from($this->string('plan')->value());
    }
}
