<?php

namespace App\Services\Practice;

use App\Enums\PracticeLanguage;
use App\Models\PracticeQuestion;
use BackedEnum;

/**
 * The checks a quiz question passes before it is saved: an AI draft, and
 * every admin edit or publish after it. They are the hand-written bank's
 * rules ({@see SeedBank}) plus a cap on the snippet, because a wrong or
 * unanswerable key is the worst bug the quiz can have:
 *
 *  - four distinct, non-empty options, short enough to send back as an answer;
 *  - an answer that is exactly one of them;
 *  - a prompt and an explanation;
 *  - a snippet of at most 40 lines;
 *  - a language, one of its topics, and a difficulty; for a draft, the
 *    language and topic it was asked for.
 *
 * The model's answer is untrusted input, so normalize() never trusts a type:
 * anything odd becomes null or '' and errors() names it.
 *
 * `review_notes` is {"distractors": [{"option", "why"}]}: the model's one line
 * per wrong option on why it is wrong, for the admin reviewing the draft.
 * Notes are advisory and never a reason to refuse a question; a note that no
 * longer names one of the options is dropped.
 */
class QuizDraftValidator implements DraftValidator
{
    public const OPTION_COUNT = 4;

    public const MAX_CODE_LINES = 40;

    public const MAX_PROMPT_LENGTH = 2000;

    /** Below QuizAnswerRequest's 2000, so every option can be sent back as an answer. */
    public const MAX_OPTION_LENGTH = 500;

    public const MAX_EXPLANATION_LENGTH = 4000;

    public const MAX_NOTE_LENGTH = 500;

    public function normalize(array $question): array
    {
        $options = $this->options($question['options'] ?? null);

        return [
            'language' => $this->key($question['language'] ?? null),
            'topic' => $this->key($question['topic'] ?? null),
            'difficulty' => $this->key($question['difficulty'] ?? null),
            'prompt' => $this->text($question['prompt'] ?? null),
            'code' => $this->code($question['code'] ?? null),
            'options' => $options,
            'answer' => ['choice' => $this->choice($question['answer'] ?? null)],
            'explanation' => $this->text($question['explanation'] ?? null),
            'review_notes' => $this->notes($question['review_notes'] ?? null, $options ?? []),
        ];
    }

    public function errors(array $question, array $expected = []): array
    {
        $errors = [];
        $language = is_string($question['language'] ?? null) ? PracticeLanguage::tryFrom($question['language']) : null;
        $topic = $question['topic'] ?? null;

        if ($language === null) {
            $errors['language'] = 'The language must be one of '.implode(', ', PracticeLanguage::values()).'.';
        } elseif (isset($expected['language']) && $language->value !== $expected['language']) {
            $errors['language'] = "This was asked for {$expected['language']} but is about {$language->value}.";
        }

        if (isset($expected['topic']) && $topic !== $expected['topic']) {
            $errors['topic'] = "This was asked for the {$expected['topic']} topic but is about ".($topic ?? 'no topic').'.';
        } elseif ($language !== null && ! array_key_exists((string) $topic, $language->topics())) {
            $errors['topic'] = "The topic must be one of {$language->label()}'s: ".implode(', ', array_keys($language->topics())).'.';
        }

        if (! in_array($question['difficulty'] ?? null, PracticeQuestion::DIFFICULTIES, true)) {
            $errors['difficulty'] = 'The difficulty must be one of '.implode(', ', PracticeQuestion::DIFFICULTIES).'.';
        }

        $prompt = (string) ($question['prompt'] ?? '');
        if ($prompt === '') {
            $errors['prompt'] = 'Write the question\'s prompt.';
        } elseif (mb_strlen($prompt) > self::MAX_PROMPT_LENGTH) {
            $errors['prompt'] = 'The prompt must be at most '.self::MAX_PROMPT_LENGTH.' characters.';
        }

        $code = $question['code'] ?? null;
        if (is_string($code) && ($lines = substr_count($code, "\n") + 1) > self::MAX_CODE_LINES) {
            $errors['code'] = 'The snippet must be at most '.self::MAX_CODE_LINES." lines; this one has {$lines}.";
        }

        $options = $question['options'] ?? null;
        if ($error = $this->optionsError($options)) {
            $errors['options'] = $error;
        }

        $choice = $question['answer']['choice'] ?? null;
        if (! is_string($choice) || ! is_array($options) || ! in_array($choice, $options, true)) {
            $errors['answer'] = 'The answer must be exactly one of the options.';
        }

        $explanation = (string) ($question['explanation'] ?? '');
        if ($explanation === '') {
            $errors['explanation'] = 'Add an explanation of why the answer is right.';
        } elseif (mb_strlen($explanation) > self::MAX_EXPLANATION_LENGTH) {
            $errors['explanation'] = 'The explanation must be at most '.self::MAX_EXPLANATION_LENGTH.' characters.';
        }

        return $errors;
    }

    private function optionsError(mixed $options): ?string
    {
        if (! is_array($options) || count($options) !== self::OPTION_COUNT) {
            return 'There must be exactly four options.';
        }
        if (in_array('', $options, true)) {
            return 'Every option must be non-empty text.';
        }
        foreach ($options as $option) {
            if (mb_strlen($option) > self::MAX_OPTION_LENGTH) {
                return 'Each option must be at most '.self::MAX_OPTION_LENGTH.' characters.';
            }
        }
        if (count(array_unique(array_map('mb_strtolower', $options))) !== self::OPTION_COUNT) {
            return 'The four options must be different.';
        }

        return null;
    }

    /** A stored key such as a language or topic: a string, or an enum's value. */
    private function key(mixed $value): ?string
    {
        if ($value instanceof BackedEnum) {
            $value = $value->value;
        }

        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }

    private function text(mixed $value): string
    {
        return is_scalar($value) ? trim((string) $value) : '';
    }

    /** @return list<string>|null */
    private function options(mixed $value): ?array
    {
        if (! is_array($value) || ! array_is_list($value)) {
            return null;
        }

        return array_map(fn (mixed $option) => $this->text($option), $value);
    }

    /** Only {"choice": "..."} is a quiz key. */
    private function choice(mixed $answer): ?string
    {
        $choice = is_array($answer) ? ($answer['choice'] ?? null) : null;

        return is_scalar($choice) ? trim((string) $choice) : null;
    }

    /**
     * Unix line endings, no trailing spaces, no Markdown fence and no blank
     * lines around it; indentation is kept. Nothing left is no snippet.
     */
    private function code(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }

        $lines = array_map('rtrim', explode("\n", str_replace(["\r\n", "\r"], "\n", $value)));

        $trim = function (array $lines): array {
            while ($lines !== [] && $lines[0] === '') {
                array_shift($lines);
            }
            while ($lines !== [] && end($lines) === '') {
                array_pop($lines);
            }

            return array_values($lines);
        };

        $lines = $trim($lines);
        if (count($lines) >= 2 && preg_match('/^```[\w+#.-]*$/', ltrim($lines[0])) === 1 && trim(end($lines)) === '```') {
            $lines = $trim(array_slice($lines, 1, -1));
        }

        return $lines === [] ? null : implode("\n", $lines);
    }

    /**
     * @param  list<string>  $options
     * @return array{distractors: list<array{option: string, why: string}>}|null
     */
    private function notes(mixed $value, array $options): ?array
    {
        $raw = is_array($value) ? ($value['distractors'] ?? null) : null;
        if (! is_array($raw)) {
            return null;
        }

        $notes = [];
        foreach ($raw as $note) {
            if (! is_array($note)) {
                continue;
            }

            $option = $this->text($note['option'] ?? null);
            $why = mb_substr($this->text($note['why'] ?? null), 0, self::MAX_NOTE_LENGTH);

            if ($why === '' || ! in_array($option, $options, true) || isset($notes[$option])) {
                continue;
            }

            $notes[$option] = ['option' => $option, 'why' => $why];
        }

        return $notes === [] ? null : ['distractors' => array_values($notes)];
    }
}
