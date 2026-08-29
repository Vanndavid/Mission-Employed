<?php

namespace App\Http\Requests\Auth;

use App\Enums\AccountPlan;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * The admin plan switch. Authorization is the `admin` middleware on the route,
 * not this request; all this does is keep the column inside the AccountPlan
 * enum. There is no payment integration — an admin upgrades a user by hand.
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
        ];
    }

    public function plan(): AccountPlan
    {
        return AccountPlan::from($this->string('plan')->value());
    }
}
