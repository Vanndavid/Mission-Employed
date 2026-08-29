<?php

namespace App\Http\Controllers;

use App\Http\Requests\Tracker\UpdateBehavioralAnswerRequest;
use App\Http\Resources\BehavioralAnswerResource;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Behavioral prep answers, per user and global rather than per application.
 *
 * The save is an updateOrCreate on (user_id, theme_id) — the pair the table is
 * unique on — so re-saving a theme edits the row in place instead of stacking
 * up a new one each time the PrepRoom autosaves.
 */
class BehavioralAnswerController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return BehavioralAnswerResource::collection(
            $request->user()->behavioralAnswers()->get()
        );
    }

    public function update(UpdateBehavioralAnswerRequest $request): BehavioralAnswerResource
    {
        $answer = $request->user()->behavioralAnswers()->updateOrCreate(
            ['theme_id' => $request->themeId()],
            ['bullets' => $request->bullets()],
        );

        return new BehavioralAnswerResource($answer);
    }
}
