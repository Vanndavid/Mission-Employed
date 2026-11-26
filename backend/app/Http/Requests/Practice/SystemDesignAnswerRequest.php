<?php

namespace App\Http\Requests\Practice;

use App\Services\Practice\SystemDesignRubric;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * {sections: {requirements, estimates, api, data_model, high_level,
 * deep_dive, tradeoffs}}: free text each, any of them blank or left out.
 *
 * An answer with fewer than MIN_WORDS words in all would have every trait
 * gated and nothing for the model to read, so it is refused here rather
 * than scored 0 and charged.
 */
class SystemDesignAnswerRequest extends FormRequest
{
    /** About a thousand words a section. */
    public const MAX_SECTION = 6000;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $rules = ['sections' => ['required', 'array:'.implode(',', array_keys(SystemDesignRubric::SECTIONS))]];

        foreach (array_keys(SystemDesignRubric::SECTIONS) as $section) {
            $rules["sections.{$section}"] = ['nullable', 'string', 'max:'.self::MAX_SECTION];
        }

        return $rules;
    }

    /** @return list<callable(Validator): void> */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                $words = array_sum(array_map(
                    SystemDesignRubric::wordCount(...),
                    SystemDesignRubric::normaliseSections($this->input('sections', [])),
                ));

                if ($words < SystemDesignRubric::MIN_WORDS) {
                    $validator->errors()->add(
                        'sections',
                        'Write at least '.SystemDesignRubric::MIN_WORDS.' words before asking for a score.',
                    );
                }
            },
        ];
    }

    /** @return array<string, string> every section, '' where blank */
    public function sections(): array
    {
        return SystemDesignRubric::normaliseSections($this->validated('sections'));
    }
}
