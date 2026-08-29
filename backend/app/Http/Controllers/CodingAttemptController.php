<?php

namespace App\Http\Controllers;

use App\Http\Requests\Tracker\StoreCodingAttemptRequest;
use App\Http\Resources\CodingAttemptResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Coding practice history — the list the dashboard charts and the practice
 * screen appends to. Scoped to the token's user throughout; there is no route
 * that names an attempt by id.
 */
class CodingAttemptController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        $attempts = $request->user()->codingAttempts()
            ->orderByDesc('attempted_at')
            ->orderByDesc('id')
            ->get();

        return CodingAttemptResource::collection($attempts);
    }

    public function store(StoreCodingAttemptRequest $request): JsonResponse
    {
        $attempt = $request->user()->codingAttempts()->create($request->columns());

        return (new CodingAttemptResource($attempt))
            ->response()
            ->setStatusCode(201);
    }
}
