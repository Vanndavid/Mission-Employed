<?php

namespace App\Http\Controllers\Practice;

use App\Http\Controllers\Ai\AiController;
use App\Http\Requests\Practice\GenerateDraftsRequest;
use App\Http\Resources\AdminPracticeQuestionResource;
use App\Services\GeminiException;
use App\Services\Practice\DraftGeneration;
use Illuminate\Http\JsonResponse;

/**
 * POST /api/admin/practice/questions/generate: the AI drafts questions for
 * the bank, code checks them, and the valid ones are saved as drafts for an
 * admin to review. An admin tool, so it names no plan feature; its tokens
 * are recorded like any other call's. Extends AiController for its Gemini
 * failure containment: a 502 `ai_unavailable` with nothing upstream in it,
 * and nothing saved.
 */
class AdminQuestionDraftController extends AiController
{
    public function __invoke(GenerateDraftsRequest $request, DraftGeneration $generation): JsonResponse
    {
        try {
            $result = $generation->run($request->drafts(), $request->validated(), $request->count());
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, 'practice question drafts');
        }

        return response()->json([
            'drafts' => AdminPracticeQuestionResource::collection($result['drafts'])->resolve($request),
            'rejected' => $result['rejected'],
        ]);
    }
}
