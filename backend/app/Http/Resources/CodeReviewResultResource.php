<?php

namespace App\Http\Resources;

use App\Models\PracticeAttempt;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A scored code review, from its stored attempt: the score and how it was
 * reached, every planted issue revealed (found or missed, with its summary
 * and fix), the bonus findings, and the user's comments marked with what
 * each one found. The same shape whether it was just scored or read back.
 * Matches CodeReviewResult in frontend/types/codeReview.ts.
 *
 * @mixin PracticeAttempt
 */
class CodeReviewResultResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        $feedback = $this->feedback ?? [];
        $issues = $feedback['issues'] ?? [];
        $bonus = collect($feedback['bonus'] ?? [])->keyBy('comment');

        $comments = array_map(fn (array $comment, int $index) => [
            'line' => $comment['line'],
            'body' => $comment['body'],
            'issues' => array_values(array_column(
                array_filter($issues, fn (array $issue) => in_array($index, $issue['comments'] ?? [], true)),
                'id',
            )),
            'bonus' => $bonus->has($index),
            'note' => $bonus->get($index)['note'] ?? null,
        ], $this->response['comments'] ?? [], array_keys($this->response['comments'] ?? []));

        return [
            'id' => $this->id,
            'snippet' => (new CodeReviewSnippetResource($this->question))->resolve($request),
            'score' => $this->score,
            'maxScore' => $this->max_score,
            'rubricVersion' => $this->rubric_version,
            'breakdown' => $feedback['breakdown'] ?? null,
            'issues' => $issues,
            'bonus' => $feedback['bonus'] ?? [],
            'comments' => $comments,
            'summary' => $this->response['summary'] ?? null,
            'takeaway' => $feedback['takeaway'] ?? null,
            'createdAt' => $this->created_at?->toJSON(),
        ];
    }
}
