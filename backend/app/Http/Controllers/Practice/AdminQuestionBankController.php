<?php

namespace App\Http\Controllers\Practice;

use App\Enums\PracticeQuestionSource;
use App\Enums\PracticeQuestionStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Practice\AdminQuestionIndexRequest;
use App\Http\Requests\Practice\AdminQuestionUpdateRequest;
use App\Http\Resources\AdminPracticeQuestionResource;
use App\Models\PracticeQuestion;
use App\Services\Practice\DraftKinds;
use App\Services\Practice\DraftValidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * The admin's question bank, behind auth:sanctum + `admin`: every question of
 * every kind, reviewed, edited, published, unpublished or deleted. AI drafts
 * arrive through {@see AdminQuestionDraftController}.
 *
 * Every save runs the kind's {@see DraftValidator} on the whole question, so
 * an edit cannot publish what a draft could not. Seed rows are read-only
 * here: `practice:sync` would put the file's version back on the next deploy,
 * so they are fixed in backend/resources/practice instead. A question someone
 * has answered is unpublished rather than deleted, so their history keeps it.
 */
class AdminQuestionBankController extends Controller
{
    private const PER_PAGE = 25;

    /** Open reports first, then newest first. */
    public function index(AdminQuestionIndexRequest $request, DraftKinds $kinds): JsonResponse
    {
        $query = PracticeQuestion::query()->where($request->filters());

        if ($request->onlyReported()) {
            $query->whereHas('reports', fn ($reports) => $reports->whereNull('resolved_at'));
        }

        $page = AdminPracticeQuestionResource::withReview($query)
            ->orderByDesc('open_reports_count')
            ->orderByDesc('id')
            ->paginate(self::PER_PAGE, page: $request->page());

        return response()->json([
            'questions' => AdminPracticeQuestionResource::collection($page->getCollection())->resolve($request),
            'meta' => [
                'page' => $page->currentPage(),
                'perPage' => $page->perPage(),
                'total' => $page->total(),
                'lastPage' => $page->lastPage(),
            ],
            // The kinds the generate form can offer.
            'generators' => $kinds->kinds(),
        ]);
    }

    public function update(AdminQuestionUpdateRequest $request, PracticeQuestion $question, DraftKinds $kinds): JsonResponse
    {
        $this->refuseSeed($question);

        $validator = $kinds->for($question->kind)?->validator();
        if ($validator === null) {
            throw ValidationException::withMessages([
                'kind' => 'There are no checks for '.DraftKinds::label($question->kind).' questions yet, so they cannot be edited here.',
            ]);
        }

        $edited = $validator->normalize([...$this->contentOf($question), ...$request->columns()]);

        if ($errors = $validator->errors($edited)) {
            throw ValidationException::withMessages($errors);
        }

        $question->fill([...$edited, 'status' => $request->status() ?? $question->status])->save();

        return response()->json(['question' => $this->present($question)]);
    }

    /** Deleted when nobody has answered it; otherwise unpublished. */
    public function destroy(PracticeQuestion $question): JsonResponse
    {
        $this->refuseSeed($question);

        if ($question->attempts()->exists()) {
            $question->update(['status' => PracticeQuestionStatus::Draft]);

            return response()->json(['deleted' => false, 'question' => $this->present($question)]);
        }

        $question->delete();

        return response()->json(['deleted' => true, 'question' => null]);
    }

    /** Marks every open report resolved. Seed rows too: this edits nothing. */
    public function resolveReports(PracticeQuestion $question): JsonResponse
    {
        $question->reports()->whereNull('resolved_at')->update(['resolved_at' => now()]);

        return response()->json(['question' => $this->present($question)]);
    }

    private function refuseSeed(PracticeQuestion $question): void
    {
        if ($question->source !== PracticeQuestionSource::Seed) {
            return;
        }

        throw ValidationException::withMessages([
            'source' => "This question is hand-written ({$question->external_id}). Fix it in its file under "
                .'backend/resources/practice: practice:sync puts the file\'s version back on every deploy.',
        ]);
    }

    /**
     * The question's content columns as a validator reads them.
     *
     * @return array<string, mixed>
     */
    private function contentOf(PracticeQuestion $question): array
    {
        return [
            'language' => $question->language?->value,
            'topic' => $question->topic,
            'difficulty' => $question->difficulty,
            'prompt' => $question->prompt,
            'code' => $question->code,
            'options' => $question->options,
            'answer' => $question->answer,
            'explanation' => $question->explanation,
            'review_notes' => $question->review_notes,
        ];
    }

    /** @return array<string, mixed> */
    private function present(PracticeQuestion $question): array
    {
        return (new AdminPracticeQuestionResource(AdminPracticeQuestionResource::prepare($question)))->resolve();
    }
}
