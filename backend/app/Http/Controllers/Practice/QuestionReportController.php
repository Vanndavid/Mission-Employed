<?php

namespace App\Http\Controllers\Practice;

use App\Enums\PracticeQuestionStatus;
use App\Http\Controllers\Controller;
use App\Models\PracticeQuestion;
use App\Models\PracticeQuestionReport;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * POST /api/practice/questions/{question}/report {reason}: a user says a
 * question is wrong. One report per user per question: a second while the
 * first is open is a 409, and one after an admin resolved it reopens it.
 * Any published question of any kind; a draft is the same bare 404 as an
 * unknown id, checked before the body so a draft's id leaks nothing.
 */
class QuestionReportController extends Controller
{
    public function __invoke(Request $request, PracticeQuestion $question): JsonResponse
    {
        abort_unless($question->status === PracticeQuestionStatus::Published, 404);

        $reason = $request->validate([
            'reason' => ['required', 'string', 'max:'.PracticeQuestionReport::MAX_REASON_LENGTH],
        ])['reason'];

        $report = $question->reports()->firstWhere('user_id', $request->user()->id);

        if ($report !== null && $report->resolved_at === null) {
            return $this->alreadyReported();
        }

        try {
            ($report ?? new PracticeQuestionReport([
                'practice_question_id' => $question->id,
                'user_id' => $request->user()->id,
            ]))->fill(['reason' => $reason, 'resolved_at' => null])->save();
        } catch (UniqueConstraintViolationException) {
            // Two reports sent at once: the other one won.
            return $this->alreadyReported();
        }

        return response()->json(['reported' => true], 201);
    }

    private function alreadyReported(): JsonResponse
    {
        return response()->json([
            'message' => 'You have already reported this question. An admin will look at it.',
            'code' => 'already_reported',
        ], 409);
    }
}
