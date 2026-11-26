<?php

namespace App\Http\Requests\Practice;

use App\Enums\PracticeKind;
use App\Services\Practice\DraftGeneration;
use App\Services\Practice\DraftKind;
use App\Services\Practice\DraftKinds;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * {kind, count, ...}: every kind takes a count of 1 to 5, and the rest of
 * the fields are the kind's own ({@see DraftKind::rules()}); for the quiz,
 * language, topic and difficulty. A kind with no drafts registered in
 * {@see DraftKinds} is a 422 on `kind` that says so.
 */
class GenerateDraftsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $kind = PracticeKind::tryFrom((string) $this->input('kind'));
        $drafts = $this->drafts();

        return [
            'kind' => [
                'required',
                'string',
                Rule::in(PracticeKind::values()),
                function (string $attribute, mixed $value, Closure $fail) use ($kind, $drafts): void {
                    if ($kind !== null && $drafts === null) {
                        $fail('The AI cannot draft '.DraftKinds::label($kind).' questions yet.');
                    }
                },
            ],
            'count' => ['required', 'integer', 'min:1', 'max:'.DraftGeneration::MAX_COUNT],
            ...($drafts?->rules($this->all()) ?? []),
        ];
    }

    /** The kind's drafts, or null when it has none (or is not a kind). */
    public function drafts(): ?DraftKind
    {
        $kind = PracticeKind::tryFrom((string) $this->input('kind'));

        return $kind === null ? null : app(DraftKinds::class)->for($kind);
    }

    public function count(): int
    {
        return (int) $this->validated('count');
    }
}
