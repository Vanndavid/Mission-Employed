<?php

namespace App\Http\Controllers\Practice;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Http\Controllers\Controller;
use App\Http\Requests\Practice\QuizAnswerRequest;
use App\Http\Requests\Practice\QuizProgressRequest;
use App\Http\Requests\Practice\QuizRoundRequest;
use App\Http\Resources\QuizQuestionResource;
use App\Models\PracticeAttempt;
use App\Models\PracticeQuestion;
use App\Services\Practice\PracticeHistory;
use App\Services\Practice\QuizRounds;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * The language quiz: multiple choice from the reviewed bank, scored here in
 * code. No route names a plan feature: the quiz never calls a model, is on
 * every plan and is never metered. Flat JSON, like the subscription routes.
 *
 * A draft, an unknown id and another kind's question are all the same 404.
 */
class QuizController extends Controller
{
    /** Each language with its topics and how many published questions each has. */
    public function catalog(): JsonResponse
    {
        $counts = PracticeQuestion::query()
            ->servable(PracticeKind::Quiz)
            ->toBase()
            ->selectRaw('language, topic, count(*) as total')
            ->groupBy('language', 'topic')
            ->get();

        $count = fn (PracticeLanguage $language, ?string $topic = null): int => (int) $counts
            ->where('language', $language->value)
            ->when($topic !== null, fn ($rows) => $rows->where('topic', $topic))
            ->sum('total');

        return response()->json([
            'languages' => array_map(fn (PracticeLanguage $language) => [
                'key' => $language->value,
                'label' => $language->label(),
                'questionCount' => $count($language),
                'topics' => array_map(
                    fn (string $key, string $label) => [
                        'key' => $key,
                        'label' => $label,
                        'questionCount' => $count($language, $key),
                    ],
                    array_keys($language->topics()),
                    $language->topics(),
                ),
            ], PracticeLanguage::cases()),
        ]);
    }

    /** Up to ten questions, with no answer or explanation in them. */
    public function round(QuizRoundRequest $request, QuizRounds $rounds): JsonResponse
    {
        $questions = $rounds->build($request->user(), $request->language(), $request->topic());

        return response()->json([
            'language' => $request->language()->value,
            'topic' => $request->topic(),
            'questions' => QuizQuestionResource::collection($questions)->resolve($request),
        ]);
    }

    /**
     * Score one answer and record it. The only place a quiz answer is
     * compared, and the first time the key leaves the server.
     */
    public function answer(QuizAnswerRequest $request): JsonResponse
    {
        $question = PracticeQuestion::query()
            ->servable(PracticeKind::Quiz)
            ->find($request->questionId());

        // The same bare 404 for a draft, another kind and an id that never
        // existed, as the tracker does for someone else's record.
        abort_if($question === null, 404);

        $choice = $request->choice();
        if ($choice !== null && ! in_array($choice, $question->options ?? [], true)) {
            throw ValidationException::withMessages([
                'choice' => 'That is not one of this question\'s options.',
            ]);
        }

        $correct = $question->isCorrectChoice($choice);

        $request->user()->practiceAttempts()->create([
            'practice_question_id' => $question->id,
            'kind' => PracticeKind::Quiz,
            'response' => ['choice' => $choice],
            'score' => $correct ? 1 : 0,
            'max_score' => 1,
            'correct' => $correct,
        ]);

        return response()->json([
            'correct' => $correct,
            'answer' => $question->correctChoice(),
            'explanation' => $question->explanation,
        ]);
    }

    /** Accuracy per topic, from every answer, and the open mistakes to retry. */
    public function progress(QuizProgressRequest $request, PracticeHistory $history): JsonResponse
    {
        $language = $request->language();
        $user = $request->user();

        // Published questions only: a draft is not something a user can see.
        $topicOf = PracticeQuestion::query()
            ->servable(PracticeKind::Quiz)
            ->where('language', $language)
            ->pluck('topic', 'id');

        $answers = PracticeAttempt::query()
            ->where('user_id', $user->id)
            ->where('kind', PracticeKind::Quiz)
            ->whereIn('practice_question_id', $topicOf->keys())
            ->toBase()
            ->selectRaw('practice_question_id, count(*) as answered, sum(case when correct then 1 else 0 end) as correct')
            ->groupBy('practice_question_id')
            ->get();

        $mistakes = $history->latestAttempts($user, PracticeKind::Quiz)
            ->filter(fn (PracticeAttempt $attempt) => $attempt->correct === false && $topicOf->has($attempt->practice_question_id));

        $tally = function (?string $topic) use ($answers, $mistakes, $topicOf): array {
            $inTopic = fn (int $questionId) => $topic === null || $topicOf->get($questionId) === $topic;
            $rows = $answers->filter(fn ($row) => $inTopic((int) $row->practice_question_id));
            $answered = (int) $rows->sum('answered');
            $correct = (int) $rows->sum('correct');

            return [
                'answered' => $answered,
                'correct' => $correct,
                'accuracy' => $answered > 0 ? (int) round($correct * 100 / $answered) : null,
                'openMistakes' => $mistakes->filter(fn (PracticeAttempt $a) => $inTopic($a->practice_question_id))->count(),
            ];
        };

        return response()->json([
            'language' => $language->value,
            ...$tally(null),
            'topics' => array_map(
                fn (string $key, string $label) => ['key' => $key, 'label' => $label, ...$tally($key)],
                array_keys($language->topics()),
                $language->topics(),
            ),
        ]);
    }
}
