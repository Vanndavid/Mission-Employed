<?php

namespace App\Http\Controllers\Practice;

use App\Http\Controllers\Controller;
use App\Http\Requests\Practice\PracticeAttemptIndexRequest;
use App\Http\Resources\PracticeAttemptDetailResource;
use App\Http\Resources\PracticeAttemptSummaryResource;
use App\Models\PracticeAttempt;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Practice history (task 7.5): the user's attempts in every mode that shares
 * the question bank, and one of them with what it was scored and told. A
 * read of the user's own data: no plan feature and no model call, so an
 * account that has lost Premium still has its reviews and designs.
 *
 * Problems (the AI tutor) keeps its own history in coding_attempts. Someone
 * else's attempt and an unknown id are the same bare 404.
 */
class PracticeAttemptController extends Controller
{
    private const PER_PAGE = 20;

    /** Newest first. The list says how each went, never what the answer was. */
    public function index(PracticeAttemptIndexRequest $request): JsonResponse
    {
        $page = PracticeAttempt::query()
            ->with('question')
            ->where('user_id', $request->user()->id)
            ->when($request->kind(), fn ($query, $kind) => $query->where('kind', $kind))
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(self::PER_PAGE, page: $request->page());

        return response()->json([
            'attempts' => PracticeAttemptSummaryResource::collection($page->getCollection())->resolve($request),
            'meta' => [
                'page' => $page->currentPage(),
                'perPage' => $page->perPage(),
                'total' => $page->total(),
                'lastPage' => $page->lastPage(),
            ],
        ]);
    }

    /** One attempt, with what that mode's result screen needs to draw it again. */
    public function show(Request $request, int $attempt): JsonResponse
    {
        $found = PracticeAttempt::query()
            ->with('question')
            ->where('user_id', $request->user()->id)
            ->find($attempt);

        abort_if($found === null, 404);

        return response()->json((new PracticeAttemptDetailResource($found))->resolve($request));
    }
}
