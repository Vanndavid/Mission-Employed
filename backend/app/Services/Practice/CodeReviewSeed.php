<?php

namespace App\Services\Practice;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;

/**
 * The seed format for code review snippets,
 * backend/resources/practice/code_review/<language>.json. {@see SeedBank}
 * calls it for that directory; the rules a snippet must meet are
 * {@see CodeReviewItemValidator}'s, shared with AI drafts.
 *
 *     {
 *       "language": "javascript",
 *       "snippets": [{
 *         "id": "review-js-orders-page",   stable forever: it is external_id
 *         "title": "…",
 *         "difficulty": "medium",
 *         "prompt": "What the code is meant to do.",
 *         "code": ["line 1", "line 2", …],  one string per line, so an issue's
 *                                           range can be read off the file
 *         "issues": [{"id", "lines": [start, end], "category", "severity", "summary", "fix"}],
 *         "explanation": "The takeaway shown after a review."
 *       }]
 *     }
 *
 * A snippet's title is stored in practice_questions.topic: code review has
 * no topic list of its own (the categories that matter are on its issues),
 * and this keeps the bank's schema the one every mode shares.
 */
class CodeReviewSeed
{
    public function __construct(private readonly CodeReviewItemValidator $validator = new CodeReviewItemValidator) {}

    /**
     * @param  array<mixed>  $data
     * @param  list<string>  $problems
     * @return list<array<string, mixed>>
     */
    public function rows(string $file, array $data, array &$problems): array
    {
        $language = is_string($data['language'] ?? null) ? PracticeLanguage::tryFrom($data['language']) : null;
        if ($language === null) {
            $problems[] = "{$file}: \"language\" must be one of ".implode(', ', PracticeLanguage::values());

            return [];
        }

        $snippets = $data['snippets'] ?? null;
        if (! is_array($snippets) || ! array_is_list($snippets)) {
            $problems[] = "{$file}: \"snippets\" must be a list";

            return [];
        }

        $rows = [];
        foreach ($snippets as $i => $snippet) {
            $where = "{$file} #{$i}".(is_string($snippet['id'] ?? null) ? " ({$snippet['id']})" : '');
            $errors = is_array($snippet) ? $this->errors($snippet) : ['is not an object'];

            if ($errors !== []) {
                foreach ($errors as $error) {
                    $problems[] = "{$where}: {$error}";
                }

                continue;
            }

            $item = [...$snippet, 'code' => implode("\n", $snippet['code'])];

            $rows[] = [
                'external_id' => $snippet['id'],
                'kind' => PracticeKind::CodeReview,
                'language' => $language,
                'topic' => trim($item['title']),
                'difficulty' => $item['difficulty'],
                'prompt' => $item['prompt'],
                'code' => $item['code'],
                'options' => null,
                'answer' => $this->validator->answer($item),
                'explanation' => $item['explanation'],
            ];
        }

        return $rows;
    }

    /**
     * @param  array<mixed>  $snippet
     * @return list<string>
     */
    private function errors(array $snippet): array
    {
        $errors = [];

        if (! is_string($snippet['id'] ?? null) || trim($snippet['id']) === '') {
            $errors[] = 'needs an id';
        }

        $code = $snippet['code'] ?? null;
        if (! is_array($code) || ! array_is_list($code) || $code === [] || count(array_filter($code, 'is_string')) !== count($code)) {
            return [...$errors, 'code must be a list of lines, one string each'];
        }

        return [...$errors, ...$this->validator->errors([...$snippet, 'code' => implode("\n", $code)])];
    }
}
