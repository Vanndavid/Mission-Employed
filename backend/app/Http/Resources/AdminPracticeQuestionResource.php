<?php

namespace App\Http\Resources;

use App\Models\PracticeQuestion;
use App\Models\PracticeQuestionReport;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A question as the admin reviews it on the question bank: everything a user
 * is served, plus the key, the AI's review notes, how many attempts it has
 * and its open reports with their reasons. Admin routes only. Matches
 * AdminQuestion in frontend/types/questionBank.ts.
 *
 * Call {@see self::prepare()} (or the same withCount/with on a query) first,
 * or the counts read as zero.
 *
 * @mixin PracticeQuestion
 */
class AdminPracticeQuestionResource extends JsonResource
{
    /**
     * The counts and open reports this resource reads, for a query.
     *
     * @param  Builder<PracticeQuestion>  $query
     * @return Builder<PracticeQuestion>
     */
    public static function withReview(Builder $query): Builder
    {
        return $query
            ->withCount(['attempts', 'reports as open_reports_count' => fn (Builder $q) => $q->whereNull('resolved_at')])
            ->with(['reports' => fn (HasMany $q) => $q->whereNull('resolved_at')->orderBy('id')]);
    }

    /**
     * The same for questions already loaded.
     *
     * @template T of PracticeQuestion|Collection<int, PracticeQuestion>
     *
     * @param  T  $questions
     * @return T
     */
    public static function prepare(PracticeQuestion|Collection $questions): PracticeQuestion|Collection
    {
        return $questions
            ->loadCount(['attempts', 'reports as open_reports_count' => fn (Builder $q) => $q->whereNull('resolved_at')])
            ->load(['reports' => fn (HasMany $q) => $q->whereNull('resolved_at')->orderBy('id')]);
    }

    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind->value,
            'language' => $this->language?->value,
            'topic' => $this->topic,
            'difficulty' => $this->difficulty,
            'prompt' => $this->prompt,
            'code' => $this->code,
            'options' => $this->options,
            'answer' => $this->answer,
            'explanation' => $this->explanation,
            'reviewNotes' => $this->review_notes,
            'status' => $this->status->value,
            'source' => $this->source->value,
            'externalId' => $this->external_id,
            'attemptCount' => (int) ($this->attempts_count ?? 0),
            'openReports' => (int) ($this->open_reports_count ?? 0),
            'reports' => $this->relationLoaded('reports')
                ? $this->reports->map(fn (PracticeQuestionReport $report) => [
                    'id' => $report->id,
                    'reason' => $report->reason,
                    // updated_at: a report made again after a resolution reopens the row.
                    'reportedAt' => $report->updated_at?->toJSON(),
                ])->values()->all()
                : [],
            'createdAt' => $this->created_at?->toJSON(),
            'updatedAt' => $this->updated_at?->toJSON(),
        ];
    }
}
