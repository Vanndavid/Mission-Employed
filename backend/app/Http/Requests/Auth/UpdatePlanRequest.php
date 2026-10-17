<?php

namespace App\Http\Requests\Auth;

use App\Enums\Feature;
use App\Enums\QuotaPeriod;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * An admin's edit to one plan. Every key is optional; a feature that is sent
 * must say all three of enabled, limit and period, so a limit is never
 * cleared to unlimited by leaving it out. A null limit is unlimited.
 */
class UpdatePlanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:60'],
            'priceLabel' => ['sometimes', 'nullable', 'string', 'max:60'],
            'description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'requestsPerMinute' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:10000'],
            'features' => ['sometimes', 'array:'.implode(',', Feature::values())],
            'features.*' => ['array'],
            'features.*.enabled' => ['required', 'boolean'],
            // To switch a feature off, untick it; a limit of 0 would only
            // turn it into a 429 that says it resets tomorrow.
            'features.*.limit' => ['present', 'nullable', 'integer', 'min:1', 'max:1000000'],
            'features.*.period' => ['required', 'string', Rule::in(QuotaPeriod::values())],
        ];
    }

    /** @return array<string, mixed> plans columns */
    public function planAttributes(): array
    {
        $columns = [
            'name' => 'name',
            'priceLabel' => 'price_label',
            'description' => 'description',
            'requestsPerMinute' => 'requests_per_minute',
        ];

        $attributes = [];

        foreach ($columns as $input => $column) {
            if ($this->has($input)) {
                $value = $this->validated($input);
                $attributes[$column] = is_string($value) && trim($value) === '' ? null : $value;
            }
        }

        return $attributes;
    }

    /** @return array<string, array{enabled: bool, quota: int|null, period: string}> plan_features columns by feature */
    public function featureSettings(): array
    {
        return array_map(fn (array $setting) => [
            'enabled' => (bool) $setting['enabled'],
            'quota' => $setting['limit'] === null ? null : (int) $setting['limit'],
            'period' => $setting['period'],
        ], $this->validated('features', []));
    }
}
