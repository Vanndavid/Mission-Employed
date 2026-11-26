<?php

namespace App\Services\Practice;

use App\Enums\PracticeQuestionSource;
use App\Enums\PracticeQuestionStatus;
use App\Models\PracticeQuestion;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * One batch of AI drafts for the practice bank, the same way for every kind:
 *
 *  1. one generateJson call, shown what the bank already has;
 *  2. every item mapped by its {@see DraftKind}, normalized and checked by
 *     the kind's {@see DraftValidator} and its draft-only checks, and checked
 *     against the bank and the rest of the batch for repeats;
 *  3. the valid ones saved as drafts (source ai), which no user is served
 *     until an admin publishes them; the rest returned with their reasons.
 *
 * The model's answer is untrusted input. Nothing is saved when the model
 * call fails, and nothing it says decides a column the validator has not
 * passed.
 */
class DraftGeneration
{
    public const MAX_COUNT = 5;

    /** How many questions already in the bank the prompt lists. */
    private const BANK_EXAMPLES = 40;

    /** How much of an existing snippet those lines quote. */
    private const SNIPPET_PREVIEW = 100;

    public function __construct(private readonly GeminiClient $gemini) {}

    /**
     * @param  array<string, mixed>  $request  The validated generate request.
     * @return array{drafts: Collection<int, PracticeQuestion>, rejected: list<array{index: int, prompt: string|null, reasons: list<string>}>}
     *
     * @throws GeminiException
     */
    public function run(DraftKind $drafts, array $request, int $count): array
    {
        $count = max(1, min(self::MAX_COUNT, $count));
        $pinned = $drafts->pinned($request);

        $bank = PracticeQuestion::query()
            ->where('kind', $drafts->kind())
            ->where($pinned)
            ->latest('id')
            ->get(['id', 'prompt', 'code']);

        $answer = $this->gemini->generateJson(
            $drafts->prompt($request, $count, $this->examples($bank)),
            $drafts->schema(),
        );

        $items = $answer['questions'] ?? null;
        $items = is_array($items) && array_is_list($items) ? $items : [];

        $validator = $drafts->validator();
        /** @var array<string, string> $seen fingerprint => what it repeats */
        $seen = [];
        foreach ($bank as $question) {
            $seen[self::fingerprint($question->prompt, $question->code)] ??= "question #{$question->id}, already in the bank";
        }

        $valid = [];
        $rejected = [];

        foreach ($items as $i => $item) {
            $index = $i + 1;
            $question = $validator->normalize($drafts->fromModel(is_array($item) ? $item : [], $request));
            $prompt = is_string($question['prompt'] ?? null) && $question['prompt'] !== '' ? $question['prompt'] : null;
            $fingerprint = self::fingerprint($prompt, $question['code'] ?? null);

            $reasons = $index > $count
                ? ["Only {$count} ".($count === 1 ? 'was' : 'were').' asked for.']
                : array_values($validator->errors($question, $pinned));

            if ($reasons === []) {
                $reasons = $drafts->draftErrors(is_array($item) ? $item : [], $question);
            }

            if ($reasons === [] && isset($seen[$fingerprint])) {
                $reasons[] = "It repeats {$seen[$fingerprint]}.";
            }

            if ($reasons !== []) {
                $rejected[] = ['index' => $index, 'prompt' => $prompt, 'reasons' => $reasons];

                continue;
            }

            $seen[$fingerprint] = "item {$index} of this batch";
            $valid[] = $question;
        }

        $saved = DB::transaction(fn () => array_map(
            fn (array $question) => PracticeQuestion::create([
                ...$question,
                'kind' => $drafts->kind(),
                'status' => PracticeQuestionStatus::Draft,
                'source' => PracticeQuestionSource::Ai,
            ]),
            $valid,
        ));

        return ['drafts' => new Collection($saved), 'rejected' => $rejected];
    }

    /**
     * One line per question already in the bank, newest first: the prompt,
     * and the start of its snippet, since many prompts are the same few words.
     *
     * @param  Collection<int, PracticeQuestion>  $bank
     * @return list<string>
     */
    private function examples(Collection $bank): array
    {
        return $bank->take(self::BANK_EXAMPLES)->map(function (PracticeQuestion $question): string {
            $line = self::squash($question->prompt);
            $code = self::squash((string) $question->code);

            return $code === '' ? $line : $line.' | code: '.mb_strimwidth($code, 0, self::SNIPPET_PREVIEW, '…');
        })->values()->all();
    }

    /** The same question asked twice, whatever the spacing or case. */
    private static function fingerprint(?string $prompt, ?string $code): string
    {
        return mb_strtolower(self::squash((string) $prompt))."\0".self::squash((string) $code);
    }

    private static function squash(string $text): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', $text));
    }
}
