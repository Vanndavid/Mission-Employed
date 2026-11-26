<?php

namespace App\Services\Practice;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Models\PracticeQuestion;
use Illuminate\Validation\Rule;

/**
 * AI drafts of quiz questions: {language, topic, difficulty} in, multiple
 * choice out, checked by {@see QuizDraftValidator}.
 *
 * The model is asked for the language and topic back on every item, so a
 * draft that drifted (a Python question in a JavaScript batch) is caught
 * rather than filed under the wrong language. The difficulty is the
 * request's: the model is not asked to judge it. It is also asked for one
 * line per wrong option on why it is wrong, which the admin reads beside the
 * key: a line that argues for the "wrong" option is how a bad key shows.
 */
class QuizDrafts implements DraftKind
{
    private const DIFFICULTY_GUIDE = [
        'easy' => 'core behaviour a junior developer should know',
        'medium' => 'behaviour that catches out developers with a year or two of experience',
        'hard' => 'subtle behaviour that surprises experienced developers',
    ];

    public function __construct(private readonly QuizDraftValidator $validator) {}

    public function kind(): PracticeKind
    {
        return PracticeKind::Quiz;
    }

    public function rules(array $input): array
    {
        $language = is_string($input['language'] ?? null) ? PracticeLanguage::tryFrom($input['language']) : null;

        return [
            'language' => ['required', 'string', Rule::in(PracticeLanguage::values())],
            // Only checkable once the language is known; a bad language is its own error.
            'topic' => ['required', 'string', ...($language ? [Rule::in(array_keys($language->topics()))] : [])],
            'difficulty' => ['required', 'string', Rule::in(PracticeQuestion::DIFFICULTIES)],
        ];
    }

    public function pinned(array $request): array
    {
        return ['language' => $request['language'], 'topic' => $request['topic']];
    }

    public function prompt(array $request, int $count, array $existing): string
    {
        $language = PracticeLanguage::from($request['language']);
        $topic = $request['topic'];
        $topicLabel = $language->topics()[$topic];
        $difficulty = $request['difficulty'];
        $level = self::DIFFICULTY_GUIDE[$difficulty];
        $maxLines = QuizDraftValidator::MAX_CODE_LINES;
        $plural = $count === 1 ? 'question' : 'questions';
        $bank = $existing === []
            ? '(none yet)'
            : implode("\n", array_map(fn (string $line) => "- {$line}", $existing));

        return <<<PROMPT
            Write {$count} multiple-choice {$plural} for software engineers practising {$language->label()}.

            Topic: {$topicLabel}. Difficulty: {$difficulty}, meaning {$level}.

            For each question:
            - "language": exactly "{$language->value}". "topic": exactly "{$topic}".
            - "prompt": the question in one or two sentences, such as "What does this print?",
              "Which line throws?" or "Which is the idiomatic way to ...?".
            - "code": the snippet the question is about, at most {$maxLines} lines and usually under 15,
              as plain text with no Markdown fences. Use "" when the question needs no code.
            - "options": exactly four different answers, each short. Exactly one is correct, and
              the other three are mistakes a real developer could make.
            - "answer": the correct option, copied character for character from "options".
            - "explanation": two to four sentences on why the answer is right, written for someone
              who picked a wrong option.
            - "distractorNotes": one entry for each of the three wrong options: "option" copied
              character for character, and "why" in one line saying why it is wrong. Never write a
              note for the answer.

            Be certain of every answer. Trace the code line by line in the language's current
            stable version before choosing it, and prefer behaviour that is well defined over
            anything that depends on the platform, a library version or timing. Test understanding
            rather than trivia, and make each question different from the others.

            Already in the bank on this topic, so do not repeat them:
            {$bank}
            PROMPT;
    }

    public function schema(): array
    {
        $string = ['type' => 'STRING'];

        return [
            'type' => 'OBJECT',
            'properties' => [
                'questions' => [
                    'type' => 'ARRAY',
                    'items' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'language' => $string,
                            'topic' => $string,
                            'prompt' => $string,
                            'code' => $string,
                            'options' => ['type' => 'ARRAY', 'items' => $string],
                            'answer' => $string,
                            'explanation' => $string,
                            'distractorNotes' => [
                                'type' => 'ARRAY',
                                'items' => [
                                    'type' => 'OBJECT',
                                    'properties' => ['option' => $string, 'why' => $string],
                                    'required' => ['option', 'why'],
                                ],
                            ],
                        ],
                        'required' => ['language', 'topic', 'prompt', 'options', 'answer', 'explanation', 'distractorNotes'],
                    ],
                ],
            ],
            'required' => ['questions'],
        ];
    }

    public function fromModel(array $item, array $request): array
    {
        return [
            'language' => $item['language'] ?? null,
            'topic' => $item['topic'] ?? null,
            'difficulty' => $request['difficulty'],
            'prompt' => $item['prompt'] ?? null,
            'code' => $item['code'] ?? null,
            'options' => $item['options'] ?? null,
            'answer' => ['choice' => $item['answer'] ?? null],
            'explanation' => $item['explanation'] ?? null,
            'review_notes' => ['distractors' => $item['distractorNotes'] ?? null],
        ];
    }

    /** Everything a quiz question needs is in its columns. */
    public function draftErrors(array $item, array $question): array
    {
        return [];
    }

    public function validator(): DraftValidator
    {
        return $this->validator;
    }
}
