<?php

namespace App\Http\Requests\Auth;

use App\Enums\NavTab;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * An admin's tab list: every tab users should not see. The whole list, not a
 * patch, so an empty array shows them all.
 */
class UpdateHiddenTabsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'hiddenTabs' => ['present', 'array'],
            'hiddenTabs.*' => ['string', 'distinct', Rule::in(NavTab::values())],
        ];
    }

    /** @return list<string> */
    public function hiddenTabs(): array
    {
        return array_values($this->validated('hiddenTabs'));
    }
}
