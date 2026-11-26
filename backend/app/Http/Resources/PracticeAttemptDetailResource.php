<?php

namespace App\Http\Resources;

use App\Enums\PracticeKind;
use App\Enums\PracticeQuestionStatus;
use App\Models\PracticeAttempt;
use App\Models\PracticeQuestion;
use App\Services\Practice\SystemDesignRubric;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One practice attempt read back from history, with `result` in the shape
 * that mode's own result screen draws, so the history page reuses it:
 *
 *  - quiz: the question (options in the bank's order), the choice, and the
 *    key and explanation the answer was told;
 *  - code review: {@see CodeReviewResultResource}, as
 *    GET /api/practice/code-review/reviews/{id} answers it;
 *  - system design: the report as POST .../answers answered it (the traits
 *    from the stored feedback), the scenario, the answer and the rubric.
 *
 * Only ever built for the user's own attempt, so the key it reveals is that
 * of a question they answered, and only that question's. Matches
 * PracticeAttemptDetail in frontend/types/practiceHistory.ts.
 *
 * @mixin PracticeAttempt
 */
class PracticeAttemptDetailResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind->value,
            'score' => $this->score,
            'maxScore' => $this->max_score,
            'correct' => $this->correct,
            'rubricVersion' => $this->rubric_version,
            'createdAt' => $this->created_at?->toJSON(),
            'result' => match ($this->kind) {
                PracticeKind::Quiz => $this->quiz(),
                PracticeKind::CodeReview => (new CodeReviewResultResource($this->resource))->resolve($request),
                PracticeKind::SystemDesign => $this->systemDesign($request),
            },
        ];
    }

    /** A quiz topic's name, or its key if the language no longer has it. */
    public static function topicLabel(PracticeQuestion $question): ?string
    {
        if ($question->topic === null) {
            return null;
        }

        return $question->language?->topics()[$question->topic] ?? $question->topic;
    }

    /** @return array<string, mixed> */
    private function quiz(): array
    {
        $question = $this->question;

        return [
            'question' => [
                'id' => $question->id,
                'language' => $question->language?->value,
                'topic' => $question->topic,
                'topicLabel' => self::topicLabel($question),
                'difficulty' => $question->difficulty,
                'prompt' => $question->prompt,
                'code' => $question->code,
                'options' => $question->options ?? [],
                'published' => $question->status === PracticeQuestionStatus::Published,
            ],
            'choice' => $this->response['choice'] ?? null,
            'correct' => $this->correct === true,
            'answer' => $question->correctChoice(),
            'explanation' => $question->explanation,
        ];
    }

    /** @return array<string, mixed> */
    private function systemDesign(Request $request): array
    {
        $question = $this->question;

        return [
            'scenario' => SystemDesignScenarioResource::make($question)->resolve($request),
            'sections' => SystemDesignRubric::normaliseSections($this->response['sections'] ?? []),
            'report' => [
                'attemptId' => $this->id,
                'questionId' => $question->id,
                'rubricVersion' => $this->rubric_version,
                'score' => $this->score,
                'maxScore' => $this->max_score,
                'traits' => $this->feedback['traits'] ?? [],
                'explanation' => $question->explanation,
            ],
            // The rubric as it is now; the report says which version it was
            // scored against. Only sd-1 exists so far.
            'rubric' => SystemDesignRubric::present(),
        ];
    }
}
