<?php

namespace App\Http\Controllers;

use App\Http\Requests\Tracker\SearchSeekJobsRequest;
use App\Services\Seek\SeekException;
use App\Services\Seek\SeekJobSearch;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;

/**
 * Proxy Seek listings into the job applications tracker.
 *
 * The SPA cannot call Seek from the browser (cross-origin-resource-policy is
 * same-origin), and upstream error bodies must never reach the client — the
 * same rule as GeminiException. Failures become a 502 with a fixed sentence.
 */
class SeekJobController extends Controller
{
    /** Bad gateway: the request was fine, Seek was not. */
    private const UPSTREAM_STATUS = 502;

    public function index(SearchSeekJobsRequest $request, SeekJobSearch $search): JsonResponse
    {
        try {
            return response()->json($search->search(
                $request->string('keywords')->trim()->value(),
                $request->string('where')->trim()->value(),
                $request->integer('page', SeekJobSearch::DEFAULT_PAGE),
                $request->integer('pageSize', SeekJobSearch::DEFAULT_PAGE_SIZE),
                $request->string('sort')->trim()->value() ?: SeekJobSearch::SORT_LISTED_DATE,
            ));
        } catch (SeekException $exception) {
            Log::error('Seek job search failed: '.$exception->getMessage(), $exception->context());

            return response()->json([
                'message' => 'Seek is unavailable right now. Please try again in a moment.',
                'code' => 'seek_unavailable',
            ], self::UPSTREAM_STATUS);
        }
    }
}
