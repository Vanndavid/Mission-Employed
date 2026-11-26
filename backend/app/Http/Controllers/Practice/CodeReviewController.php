<?php

namespace App\Http\Controllers\Practice;

use App\Enums\PracticeKind;
use App\Http\Controllers\Ai\AiController;
use App\Http\Requests\Practice\CodeReviewNextRequest;
use App\Http\Requests\Practice\CodeReviewSubmitRequest;
use App\Http\Resources\CodeReviewResultResource;
use App\Http\Resources\CodeReviewSnippetResource;
use App\Models\PracticeAttempt;
use App\Models\PracticeQuestion;
use App\Services\Practice\CodeReviewGrader;
use App\Services\Practice\CodeReviewItemValidator;
use App\Services\Practice\CodeReviewPicker;
use App\Services\Practice\CodeReviewScorer;
use App\Services\GeminiException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Code review practice: review a snippet like a pull request, and the AI
 * checks the comments against the issues planted in it. The AI matches;
 * {@see CodeReviewScorer} scores. A plan feature (`code_review`): opening a
 * snippet or reading a review back is free, each scored review is one use.
 *
 * Ids are looked up here rather than bound on the route, so the plan's gate
 * answers first and a free account learns nothing about which ids exist. A
 * draft, an unknown id and another kind's question are the same bare 404,
 * as is someone else's review.
 */
class CodeReviewController extends AiController
{
    /** The next snippet to review, without its planted issues. */
    public function next(CodeReviewNextRequest $request, CodeReviewPicker $picker): JsonResponse
    {
        $next = $picker->next($request->user(), $request->language(), $request->difficulty(), $request->exclude(), $request->category());

        return response()->json([
            ...$next,
            'snippet' => $next['snippet'] === null ? null : (new CodeReviewSnippetResource($next['snippet']))->resolve($request),
        ]);
    }

    /** Score a review, store it, and reveal the planted issues. */
    public function review(CodeReviewSubmitRequest $request, int $question, CodeReviewGrader $grader): JsonResponse
    {
        $snippet = PracticeQuestion::query()->servable(PracticeKind::CodeReview)->find($question);
        abort_if($snippet === null, 404);

        $comments = $request->comments();
        $lineCount = CodeReviewItemValidator::lineCount((string) $snippet->code);
        foreach ($comments as $i => $comment) {
            if ($comment['line'] > $lineCount) {
                throw ValidationException::withMessages([
                    "comments.{$i}.line" => "Line {$comment['line']} is past the end of this snippet, which has {$lineCount} lines.",
                ]);
            }
        }

        try {
            $graded = $grader->grade($snippet, $comments, $request->summary());
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, 'code review scoring');
        }

        $attempt = $request->user()->practiceAttempts()->create([
            'practice_question_id' => $snippet->id,
            'kind' => PracticeKind::CodeReview,
            'response' => ['comments' => $comments, 'summary' => $request->summary()],
            'score' => $graded['score'],
            'max_score' => $graded['maxScore'],
            'correct' => null,
            'feedback' => $graded['feedback'],
            'rubric_version' => CodeReviewScorer::RUBRIC_VERSION,
        ]);

        // Read back, so this answer and a later GET are the same to the byte.
        $attempt = $attempt->fresh()->setRelation('question', $snippet);

        return response()->json((new CodeReviewResultResource($attempt))->resolve($request), 201);
    }

    /** A review the user stored earlier, as it was scored. */
    public function show(Request $request, int $attempt): JsonResponse
    {
        $review = PracticeAttempt::query()
            ->with('question')
            ->where('user_id', $request->user()->id)
            ->where('kind', PracticeKind::CodeReview)
            ->find($attempt);

        abort_if($review === null, 404);

        return response()->json((new CodeReviewResultResource($review))->resolve($request));
    }
}
