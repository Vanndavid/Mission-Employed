<?php

namespace App\Services\Practice;

use App\Enums\PracticeKind;

/**
 * What the question bank needs from one {@see PracticeKind} to have the AI
 * draft its questions: the request it takes, one prompt and response schema,
 * how an item of the answer maps onto practice_questions, and the
 * {@see DraftValidator} every item and every later edit must pass.
 *
 * {@see DraftGeneration} does the rest the same way for every kind: one
 * model call, each item normalized and checked, repeats dropped, the valid
 * ones saved as ai drafts and the rest returned with their reasons. A kind
 * plugs in by implementing this and adding a line to {@see DraftKinds}.
 */
interface DraftKind
{
    public function kind(): PracticeKind;

    /**
     * Validation rules for the generate request's own fields, besides `kind`
     * and `count`, which every kind takes.
     *
     * @param  array<string, mixed>  $input  The raw request, for rules that depend on another field.
     * @return array<string, mixed>
     */
    public function rules(array $input): array;

    /**
     * The columns the request fixes for every draft, such as the language and
     * topic. A draft that drifts from them is dropped, and questions already
     * in the bank under them are shown to the model so it does not repeat them.
     *
     * @param  array<string, mixed>  $request  The validated request.
     * @return array<string, string>
     */
    public function pinned(array $request): array;

    /**
     * The prompt asking for $count questions.
     *
     * @param  array<string, mixed>  $request  The validated request.
     * @param  list<string>  $existing  Questions already in the bank under the pinned columns, one line each.
     */
    public function prompt(array $request, int $count, array $existing): string;

    /**
     * Gemini's responseSchema. The answer must carry its items in a
     * top-level `questions` array.
     *
     * @return array<string, mixed>
     */
    public function schema(): array;

    /**
     * One item of the model's `questions` as practice_questions columns,
     * ready for the validator's normalize(). Never throws: the item is
     * untrusted input and may be any shape.
     *
     * @param  array<mixed>  $item
     * @param  array<string, mixed>  $request  The validated request.
     * @return array<string, mixed>
     */
    public function fromModel(array $item, array $request): array;

    public function validator(): DraftValidator;
}
