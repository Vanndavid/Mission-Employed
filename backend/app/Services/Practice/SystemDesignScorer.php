<?php

namespace App\Services\Practice;

use App\Models\PracticeQuestion;
use App\Services\Ai\SystemDesignPrompts;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use App\Services\GeminiService;

/**
 * Scores one system design answer, after Eleph's writing scorer
 * (src/shared/server/writingScorer.ts): code applies the gates, the model
 * rates only the traits that passed them against the written descriptors
 * and the scenario's key points, and {@see SystemDesignRubric} weights the
 * ratings and sums them.
 *
 * The model's answer is untrusted input and goes through sanitise() first.
 */
class SystemDesignScorer
{
    /** Longer than this is not "one short quote". */
    public const MAX_EVIDENCE = 400;

    public const MAX_IMPROVEMENT = 600;

    public function __construct(private readonly GeminiClient $gemini) {}

    /**
     * @param  array<string, mixed>  $input  section => text, as the client sent it
     * @return array{sections: array<string, string>, report: array{score: int, maxScore: int, rubricVersion: string, traits: list<array<string, mixed>>}}
     *
     * @throws GeminiException when the model fails, or answers without rating
     *                         every trait it was asked about
     */
    public function score(PracticeQuestion $question, array $input): array
    {
        $sections = SystemDesignRubric::normaliseSections($input);
        $keyPoints = SystemDesignItemValidator::keyPointsOf($question);
        $judged = SystemDesignRubric::judgedTraits($sections);
        $ratings = [];

        if ($judged !== []) {
            $answer = $this->gemini->generateJson(
                SystemDesignPrompts::score($question->topic, $question->prompt, $sections, $judged, $keyPoints),
                SystemDesignPrompts::scoreSchema($judged),
                SystemDesignPrompts::SYSTEM,
            );

            $ratings = self::sanitise($answer['traits'] ?? null, $judged, $keyPoints, implode("\n\n", $sections));

            // A trait left unrated would score 0 for the model's slip, not the
            // answer's. Fail the call instead: nothing is stored or charged.
            if (array_diff($judged, array_keys($ratings)) !== []) {
                throw GeminiException::emptyResponse(GeminiService::DEFAULT_MODEL, json_encode($answer) ?: null);
            }
        }

        return [
            'sections' => $sections,
            'report' => SystemDesignRubric::report($sections, $keyPoints, $ratings),
        ];
    }

    /**
     * Keep only well-formed ratings of the traits that were asked about: the
     * first rating of each, a numeric score rounded and clamped to the
     * scale, a quote only when it is in the answer (ignoring case, spacing
     * and wrapping quote marks), a trimmed improvement, and the covered key
     * points as 0-based indexes of that trait's own (the prompt numbers them
     * from 1). A rating without a numeric score is dropped.
     *
     * @param  list<string>  $judged
     * @param  array<string, list<string>>  $keyPoints
     * @return array<string, array{score: int, evidence: string|null, improvement: string|null, covered: list<int>}>
     */
    public static function sanitise(mixed $raw, array $judged, array $keyPoints, string $answer): array
    {
        if (! is_array($raw)) {
            return [];
        }

        $ratings = [];
        $haystack = self::comparable($answer);

        foreach ($raw as $item) {
            $trait = is_array($item) ? ($item['trait'] ?? null) : null;

            if (! is_string($trait) || ! in_array($trait, $judged, true) || isset($ratings[$trait])) {
                continue;
            }

            $score = $item['score'] ?? null;
            if (! is_int($score) && ! is_float($score) && ! (is_string($score) && is_numeric($score))) {
                continue;
            }

            $ratings[$trait] = [
                'score' => SystemDesignRubric::clamp((int) round((float) $score)),
                'evidence' => self::evidence($item['evidence'] ?? null, $haystack),
                'improvement' => self::improvement($item['improvement'] ?? null),
                'covered' => self::covered($item['keyPointsCovered'] ?? null, count($keyPoints[$trait] ?? [])),
            ];
        }

        return $ratings;
    }

    private static function evidence(mixed $quote, string $haystack): ?string
    {
        if (! is_string($quote)) {
            return null;
        }

        $quote = trim((string) preg_replace('/\s+/u', ' ', $quote));
        $quote = trim((string) preg_replace('/^["\'“”‘’`]+|["\'“”‘’`]+$/u', '', $quote));

        if ($quote === '' || mb_strlen($quote) > self::MAX_EVIDENCE) {
            return null;
        }

        return str_contains($haystack, self::comparable($quote)) ? $quote : null;
    }

    private static function improvement(mixed $text): ?string
    {
        if (! is_string($text)) {
            return null;
        }

        $text = trim((string) preg_replace('/\s+/u', ' ', $text));

        return $text === '' ? null : mb_substr($text, 0, self::MAX_IMPROVEMENT);
    }

    /** @return list<int> */
    private static function covered(mixed $numbers, int $count): array
    {
        if (! is_array($numbers)) {
            return [];
        }

        $covered = [];
        foreach ($numbers as $number) {
            if (is_string($number) && ctype_digit($number)) {
                $number = (int) $number;
            }
            if (is_int($number) && $number >= 1 && $number <= $count) {
                $covered[$number - 1] = true;
            }
        }

        $indexes = array_keys($covered);
        sort($indexes);

        return $indexes;
    }

    /** Lower case, curly quotes straightened, runs of space as one. */
    private static function comparable(string $text): string
    {
        $text = str_replace(['“', '”', '‘', '’'], ['"', '"', "'", "'"], $text);

        return mb_strtolower(trim((string) preg_replace('/\s+/u', ' ', $text)));
    }
}
