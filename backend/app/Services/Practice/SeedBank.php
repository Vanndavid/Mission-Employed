<?php

namespace App\Services\Practice;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Models\PracticeQuestion;

/**
 * The hand-written practice bank: backend/resources/practice/<kind>/*.json,
 * one directory per {@see PracticeKind}. `practice:sync` publishes it.
 *
 * Only the quiz has a format so far. A quiz file is one language:
 *
 *     {
 *       "language": "javascript",
 *       "questions": [{
 *         "id": "quiz-js-scope-01",          stable forever: it is external_id
 *         "topic": "scope",                  a key of PracticeLanguage::topics()
 *         "difficulty": "easy",              easy | medium | hard
 *         "prompt": "What does this print?",
 *         "code": "...",                     optional: the snippet
 *         "options": ["a", "b", "c", "d"],   exactly four, distinct
 *         "answer": "b",                     exactly one of the options
 *         "explanation": "..."
 *       }]
 *     }
 *
 * Everything is checked before anything is returned, and one bad question
 * fails the whole load: a wrong or malformed key is the worst bug the quiz
 * can have, so it never ships quietly. A new kind adds a directory and a
 * parser in rows().
 */
class SeedBank
{
    private readonly string $root;

    public function __construct(?string $root = null)
    {
        $this->root = $root ?? resource_path('practice');
    }

    /**
     * Every seed question as practice_questions columns, keyed by external_id.
     * Status and source are the sync's to set.
     *
     * @return array<string, array<string, mixed>>
     *
     * @throws InvalidSeedBank listing every problem found
     */
    public function load(): array
    {
        $rows = [];
        $problems = [];

        foreach (PracticeKind::cases() as $kind) {
            $directory = $this->root.'/'.$kind->value;
            if (! is_dir($directory)) {
                continue;
            }

            foreach (glob($directory.'/*.json') ?: [] as $path) {
                $file = $kind->value.'/'.basename($path);
                $data = json_decode((string) file_get_contents($path), true);

                if (! is_array($data)) {
                    $problems[] = "{$file}: not valid JSON";

                    continue;
                }

                foreach ($this->rows($kind, $file, $data, $problems) as $row) {
                    if (isset($rows[$row['external_id']])) {
                        $problems[] = "{$file}: {$row['external_id']} is used more than once";

                        continue;
                    }
                    $rows[$row['external_id']] = $row;
                }
            }
        }

        if ($problems !== []) {
            throw new InvalidSeedBank($problems);
        }

        return $rows;
    }

    /**
     * @param  array<mixed>  $data
     * @param  list<string>  $problems
     * @return list<array<string, mixed>>
     */
    private function rows(PracticeKind $kind, string $file, array $data, array &$problems): array
    {
        if ($kind !== PracticeKind::Quiz) {
            $problems[] = "{$file}: there is no seed format for {$kind->value} yet";

            return [];
        }

        return $this->quizRows($file, $data, $problems);
    }

    /**
     * @param  array<mixed>  $data
     * @param  list<string>  $problems
     * @return list<array<string, mixed>>
     */
    private function quizRows(string $file, array $data, array &$problems): array
    {
        $language = is_string($data['language'] ?? null) ? PracticeLanguage::tryFrom($data['language']) : null;
        if ($language === null) {
            $problems[] = "{$file}: \"language\" must be one of ".implode(', ', PracticeLanguage::values());

            return [];
        }

        $questions = $data['questions'] ?? null;
        if (! is_array($questions) || ! array_is_list($questions)) {
            $problems[] = "{$file}: \"questions\" must be a list";

            return [];
        }

        $rows = [];
        foreach ($questions as $i => $question) {
            $where = "{$file} #{$i}".(is_string($question['id'] ?? null) ? " ({$question['id']})" : '');
            $errors = is_array($question) ? $this->quizErrors($question, $language) : ['is not an object'];

            if ($errors !== []) {
                foreach ($errors as $error) {
                    $problems[] = "{$where}: {$error}";
                }

                continue;
            }

            $rows[] = [
                'external_id' => $question['id'],
                'kind' => PracticeKind::Quiz,
                'language' => $language,
                'topic' => $question['topic'],
                'difficulty' => $question['difficulty'],
                'prompt' => $question['prompt'],
                'code' => $question['code'] ?? null,
                'options' => $question['options'],
                'answer' => ['choice' => $question['answer']],
                'explanation' => $question['explanation'],
            ];
        }

        return $rows;
    }

    /**
     * Everything wrong with one quiz question; empty when it can be published.
     *
     * @param  array<mixed>  $q
     * @return list<string>
     */
    private function quizErrors(array $q, PracticeLanguage $language): array
    {
        $errors = [];
        $filled = fn (mixed $value) => is_string($value) && trim($value) !== '';

        if (! $filled($q['id'] ?? null)) {
            $errors[] = 'needs an id';
        }
        if (! is_string($q['topic'] ?? null) || ! array_key_exists($q['topic'], $language->topics())) {
            $errors[] = 'topic must be one of '.implode(', ', array_keys($language->topics()));
        }
        if (! in_array($q['difficulty'] ?? null, PracticeQuestion::DIFFICULTIES, true)) {
            $errors[] = 'difficulty must be one of '.implode(', ', PracticeQuestion::DIFFICULTIES);
        }
        if (! $filled($q['prompt'] ?? null)) {
            $errors[] = 'needs a prompt';
        }
        if (array_key_exists('code', $q) && $q['code'] !== null && ! $filled($q['code'])) {
            $errors[] = 'code, when given, must not be empty';
        }
        if (! $filled($q['explanation'] ?? null)) {
            $errors[] = 'needs an explanation';
        }

        $options = $q['options'] ?? null;
        if (! is_array($options) || ! array_is_list($options) || count($options) !== 4) {
            return [...$errors, 'needs exactly four options'];
        }
        if (count(array_filter($options, $filled)) !== 4) {
            return [...$errors, 'every option must be non-empty text'];
        }
        if (count(array_unique(array_map(fn (string $o) => mb_strtolower(trim($o)), $options))) !== 4) {
            $errors[] = 'the four options must be different';
        }
        if (! is_string($q['answer'] ?? null) || ! in_array($q['answer'], $options, true)) {
            $errors[] = 'the answer must be exactly one of the options';
        }

        return $errors;
    }
}
