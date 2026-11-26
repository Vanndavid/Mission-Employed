<?php

namespace App\Services\Practice;

use App\Enums\PracticeKind;
use App\Models\PracticeQuestion;
use Illuminate\Validation\Rule;

/**
 * AI drafts of system design scenarios: {difficulty} in, a scenario with the
 * key points a strong answer covers for every rubric trait out, checked by
 * {@see SystemDesignDraftValidator} (the seed files' rules).
 *
 * The model is shown each trait with what a full rating means
 * ({@see SystemDesignRubric}), since the key points are what an answer is
 * later rated against, and every scenario already in the bank whatever its
 * difficulty, so a new one is not the same system again. The difficulty is
 * the request's.
 */
final class SystemDesignDrafts implements DraftKind
{
    private const DIFFICULTY_GUIDE = [
        'easy' => 'one main data path and an obvious bottleneck, such as a URL shortener or a game leaderboard',
        'medium' => 'several components and one genuinely hard part, such as rate limiting, notification fan-out or booking seats under contention',
        'hard' => 'large fan-out, real-time delivery or location at scale, such as a news feed, chat or matching riders with drivers',
    ];

    /** How much of each scenario already in the bank the prompt quotes. */
    private const BANK_PREVIEW = 160;

    public function __construct(private readonly SystemDesignDraftValidator $validator) {}

    public function kind(): PracticeKind
    {
        return PracticeKind::SystemDesign;
    }

    public function rules(array $input): array
    {
        return [
            'difficulty' => ['required', 'string', Rule::in(PracticeQuestion::DIFFICULTIES)],
        ];
    }

    /** Nothing: every scenario in the bank is shown to the model. */
    public function pinned(array $request): array
    {
        return [];
    }

    public function prompt(array $request, int $count, array $existing): string
    {
        $difficulty = $request['difficulty'];
        $level = self::DIFFICULTY_GUIDE[$difficulty];
        $plural = $count === 1 ? 'scenario' : 'scenarios';
        $maxTitle = SystemDesignItemValidator::MAX_TITLE;
        $minPrompt = SystemDesignItemValidator::MIN_PROMPT;
        $maxPrompt = SystemDesignItemValidator::MAX_PROMPT;
        $minPoints = SystemDesignItemValidator::MIN_KEY_POINTS;
        $maxPoints = SystemDesignItemValidator::MAX_KEY_POINTS;
        $maxPoint = SystemDesignItemValidator::MAX_KEY_POINT;
        $sections = implode(', ', array_map(fn (array $section) => $section['label'], SystemDesignRubric::SECTIONS));
        $traits = implode("\n", array_map(
            fn (string $key, array $trait) => "  - \"{$key}\" ({$trait['label']}). Full marks: {$trait['descriptors'][SystemDesignRubric::TRAIT_MAX]}",
            array_keys(SystemDesignRubric::TRAITS),
            SystemDesignRubric::TRAITS,
        ));
        $bank = $existing === []
            ? '(none yet)'
            : implode("\n", array_map(fn (string $line) => '- '.mb_strimwidth($line, 0, self::BANK_PREVIEW, '…'), $existing));

        return <<<PROMPT
            Write {$count} system design interview {$plural} for software engineers.

            Difficulty: {$difficulty}, meaning {$level}.

            A scenario asks the candidate to design one system. They answer in fixed sections
            ({$sections}), and the answer is rated trait by trait against a fixed rubric, using the key
            points you write as what a strong answer covers.

            For each scenario:
            - "title": the system's name, at most {$maxTitle} characters, such as "URL shortener".
            - "prompt": the scenario in three to six sentences, {$minPrompt} to {$maxPrompt} characters: what the
              system does, who uses it, and real scale numbers (users, requests, data kept, latency targets)
              the candidate can estimate from. Do not suggest a design.
            - "explanation": two or three sentences, shown after scoring, on what the scenario really tests.
            - "keyPoints": for every trait below, {$minPoints} to {$maxPoints} distinct key points a strong answer covers
              for this scenario, each a short phrase under {$maxPoint} characters. The estimation points carry the
              worked numbers from the prompt, such as "About 40 new links a second (100 million a month ÷
              2.6 million seconds)": check the arithmetic.
            {$traits}

            Make each scenario different from the others and from these, already in the bank:
            {$bank}
            PROMPT;
    }

    public function schema(): array
    {
        $string = ['type' => 'STRING'];
        $traits = array_keys(SystemDesignRubric::TRAITS);

        return [
            'type' => 'OBJECT',
            'properties' => [
                'questions' => [
                    'type' => 'ARRAY',
                    'items' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'title' => $string,
                            'prompt' => $string,
                            'explanation' => $string,
                            'keyPoints' => [
                                'type' => 'OBJECT',
                                'properties' => array_fill_keys($traits, ['type' => 'ARRAY', 'items' => $string]),
                                'required' => $traits,
                            ],
                        ],
                        'required' => ['title', 'prompt', 'explanation', 'keyPoints'],
                    ],
                ],
            ],
            'required' => ['questions'],
        ];
    }

    public function fromModel(array $item, array $request): array
    {
        return [
            'topic' => $item['title'] ?? null,
            'difficulty' => $request['difficulty'],
            'prompt' => $item['prompt'] ?? null,
            'answer' => ['keyPoints' => $item['keyPoints'] ?? null],
            'explanation' => $item['explanation'] ?? null,
        ];
    }

    /** Everything a scenario needs is in its columns. */
    public function draftErrors(array $item, array $question): array
    {
        return [];
    }

    public function validator(): DraftValidator
    {
        return $this->validator;
    }
}
