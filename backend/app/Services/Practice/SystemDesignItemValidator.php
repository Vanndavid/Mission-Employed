<?php

namespace App\Services\Practice;

use App\Enums\PracticeKind;
use App\Models\PracticeQuestion;

/**
 * What makes a system design scenario fit to publish, wherever it came
 * from: a hand-written seed file ({@see SystemDesignSeed}), or an AI draft
 * an admin reviews and edits ({@see SystemDesignDraftValidator}). One set of
 * rules, so a draft cannot reach the bank in a shape the seed files could not.
 *
 * An item is:
 *
 *     {
 *       "title": "URL shortener",          at most 64 characters (stored as `topic`)
 *       "difficulty": "easy",              easy | medium | hard
 *       "prompt": "Design ... 100 million new links a month ...",   the scenario, with scale numbers
 *       "explanation": "...",              what the scenario is really testing; shown after scoring
 *       "keyPoints": {                     every rubric trait, 2 to 6 distinct short phrases each
 *         "requirements": ["...", "..."],
 *         ...
 *       }
 *     }
 *
 * The key points are the answer key: what the model checks an answer
 * against for each trait. They are stored as `answer` {"keyPoints": {...}},
 * in rubric order, and never sent to a user before they have answered.
 */
final class SystemDesignItemValidator
{
    /** @var list<string> */
    public const FIELDS = ['title', 'difficulty', 'prompt', 'explanation', 'keyPoints'];

    /** practice_questions.topic is 64 characters. */
    public const MAX_TITLE = 64;

    public const MIN_PROMPT = 80;

    public const MAX_PROMPT = 2000;

    public const MIN_EXPLANATION = 20;

    public const MIN_KEY_POINTS = 2;

    public const MAX_KEY_POINTS = 6;

    public const MAX_KEY_POINT = 200;

    /**
     * Everything wrong with an item; empty when it can be published.
     *
     * @param  array<mixed>  $item
     * @return list<string>
     */
    public static function errors(array $item): array
    {
        $errors = [];
        $filled = fn (mixed $value) => is_string($value) && trim($value) !== '';

        foreach (array_diff(array_map('strval', array_keys($item)), self::FIELDS) as $field) {
            $errors[] = "unknown field {$field}";
        }

        $title = $item['title'] ?? null;
        if (! $filled($title)) {
            $errors[] = 'needs a title';
        } elseif (mb_strlen($title) > self::MAX_TITLE) {
            $errors[] = 'the title must be at most '.self::MAX_TITLE.' characters';
        }

        if (! in_array($item['difficulty'] ?? null, PracticeQuestion::DIFFICULTIES, true)) {
            $errors[] = 'difficulty must be one of '.implode(', ', PracticeQuestion::DIFFICULTIES);
        }

        $prompt = $item['prompt'] ?? null;
        if (! $filled($prompt)) {
            $errors[] = 'needs a prompt';
        } else {
            $length = mb_strlen(trim($prompt));
            if ($length < self::MIN_PROMPT || $length > self::MAX_PROMPT) {
                $errors[] = 'the prompt must be '.self::MIN_PROMPT.' to '.self::MAX_PROMPT.' characters';
            }
            if (preg_match('/\d/', $prompt) !== 1) {
                $errors[] = 'the prompt needs scale numbers (users, requests, data)';
            }
        }

        $explanation = $item['explanation'] ?? null;
        if (! $filled($explanation) || mb_strlen(trim($explanation)) < self::MIN_EXPLANATION) {
            $errors[] = 'needs an explanation of at least '.self::MIN_EXPLANATION.' characters';
        }

        $keyPoints = $item['keyPoints'] ?? null;
        if (! is_array($keyPoints) || ($keyPoints !== [] && array_is_list($keyPoints))) {
            return [...$errors, 'keyPoints must map each rubric trait to its key points'];
        }

        foreach (array_keys($keyPoints) as $trait) {
            if (! array_key_exists((string) $trait, SystemDesignRubric::TRAITS)) {
                $errors[] = "keyPoints: {$trait} is not a rubric trait";
            }
        }

        foreach (array_keys(SystemDesignRubric::TRAITS) as $trait) {
            $errors = [...$errors, ...self::keyPointErrors($trait, $keyPoints[$trait] ?? [])];
        }

        return $errors;
    }

    /**
     * practice_questions columns for a valid item. Status, source and
     * external_id are the caller's to set.
     *
     * @param  array<string, mixed>  $item  one errors() has passed
     * @return array<string, mixed>
     */
    public static function columns(array $item): array
    {
        $keyPoints = [];
        foreach (array_keys(SystemDesignRubric::TRAITS) as $trait) {
            $keyPoints[$trait] = array_values($item['keyPoints'][$trait]);
        }

        return [
            'kind' => PracticeKind::SystemDesign,
            'language' => null,
            'topic' => trim($item['title']),
            'difficulty' => $item['difficulty'],
            'prompt' => trim($item['prompt']),
            'code' => null,
            'options' => null,
            'answer' => ['keyPoints' => $keyPoints],
            'explanation' => trim($item['explanation']),
        ];
    }

    /**
     * The key points stored on a question, trait by trait in rubric order;
     * a trait with none reads as an empty list.
     *
     * @return array<string, list<string>>
     */
    public static function keyPointsOf(PracticeQuestion $question): array
    {
        $stored = $question->answer['keyPoints'] ?? [];
        $keyPoints = [];

        foreach (array_keys(SystemDesignRubric::TRAITS) as $trait) {
            $points = is_array($stored[$trait] ?? null) ? $stored[$trait] : [];
            $keyPoints[$trait] = array_values(array_filter($points, fn (mixed $point) => is_string($point) && trim($point) !== ''));
        }

        return $keyPoints;
    }

    /** @return list<string> */
    private static function keyPointErrors(string $trait, mixed $points): array
    {
        if (! is_array($points) || ! array_is_list($points)) {
            return ["keyPoints: {$trait} must be a list"];
        }

        if (count($points) < self::MIN_KEY_POINTS) {
            return ["keyPoints: {$trait} needs at least ".self::MIN_KEY_POINTS.' key points'];
        }

        $errors = [];
        if (count($points) > self::MAX_KEY_POINTS) {
            $errors[] = "keyPoints: {$trait} has more than ".self::MAX_KEY_POINTS.' key points';
        }

        $texts = array_filter($points, fn (mixed $point) => is_string($point) && trim($point) !== '');
        if (count($texts) !== count($points)) {
            return [...$errors, "keyPoints: {$trait} has a key point that is not text"];
        }

        foreach ($texts as $point) {
            if (mb_strlen($point) > self::MAX_KEY_POINT) {
                $errors[] = "keyPoints: {$trait} has a key point over ".self::MAX_KEY_POINT.' characters';
            }
        }

        if (count(array_unique(array_map(fn (string $p) => mb_strtolower(trim($p)), $texts))) !== count($texts)) {
            $errors[] = "keyPoints: {$trait} repeats a key point";
        }

        return $errors;
    }
}
