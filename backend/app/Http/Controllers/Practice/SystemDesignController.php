<?php

namespace App\Http\Controllers\Practice;

use App\Enums\PracticeKind;
use App\Enums\PracticeQuestionStatus;
use App\Http\Controllers\Ai\AiController;
use App\Http\Requests\Practice\SystemDesignAnswerRequest;
use App\Http\Requests\Practice\SystemDesignNextRequest;
use App\Http\Resources\SystemDesignScenarioResource;
use App\Models\PracticeQuestion;
use App\Services\GeminiException;
use App\Services\Practice\SystemDesignRubric;
use App\Services\Practice\SystemDesignScenarios;
use App\Services\Practice\SystemDesignScorer;
use Illuminate\Http\JsonResponse;

/**
 * System design practice: a scenario answered in fixed sections, scored
 * against a fixed rubric ({@see SystemDesignRubric}). A plan feature,
 * `system_design`: reading a scenario needs it, and each scored answer is
 * one use. Flat JSON, like the quiz.
 *
 * An AiController for its failure containment: a Gemini failure is a 502
 * with a fixed sentence, and the upstream detail goes only to the log.
 */
class SystemDesignController extends AiController
{
    /**
     * The scenario to answer next, with the rubric it will be scored
     * against. Never the key points. `question` is null when nothing
     * matches.
     */
    public function next(SystemDesignNextRequest $request, SystemDesignScenarios $scenarios): JsonResponse
    {
        $question = $scenarios->next($request->user(), $request->difficulty(), $request->skip());

        return response()->json([
            'question' => $question === null ? null : SystemDesignScenarioResource::make($question)->resolve($request),
            'rubric' => SystemDesignRubric::present(),
        ]);
    }

    /**
     * Score an answer and store it. The first time the scenario's key
     * points leave the server, as covered and missed.
     */
    public function answer(SystemDesignAnswerRequest $request, PracticeQuestion $question, SystemDesignScorer $scorer): JsonResponse
    {
        // The same bare 404 for a draft, another kind and an unknown id.
        abort_if(
            $question->kind !== PracticeKind::SystemDesign || $question->status !== PracticeQuestionStatus::Published,
            404,
        );

        try {
            ['sections' => $sections, 'report' => $report] = $scorer->score($question, $request->sections());
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, 'system design scoring');
        }

        $attempt = $request->user()->practiceAttempts()->create([
            'practice_question_id' => $question->id,
            'kind' => PracticeKind::SystemDesign,
            'response' => ['sections' => $sections],
            'score' => $report['score'],
            'max_score' => $report['maxScore'],
            'correct' => null,
            'feedback' => ['traits' => $report['traits']],
            'rubric_version' => $report['rubricVersion'],
        ]);

        return response()->json([
            'attemptId' => $attempt->id,
            'questionId' => $question->id,
            ...$report,
            'explanation' => $question->explanation,
        ]);
    }
}
