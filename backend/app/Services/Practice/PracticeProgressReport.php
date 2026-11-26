<?php

namespace App\Services\Practice;

use App\Enums\CodeReviewCategory;
use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Models\PracticeAttempt;
use App\Models\PracticeQuestion;
use App\Models\User;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;

/**
 * How practice is going in every mode, worked out from the user's
 * practice_attempts each time it is asked, never stored (task 7.5). Read by
 * GET /api/practice/progress and the coach on Mission Control.
 *
 * Counts and averages cover the last WINDOW_DAYS days. Each area (a quiz
 * topic, a code review category, a system design trait) also lists its
 * latest RECENT_PER_AREA results, newest first and however old, so the coach
 * (frontend/utils/practiceCoach.ts) can weigh recent attempts more and still
 * has something to go on after a break. A result is the points the area was
 * worth in that attempt and how many of them it earned:
 *
 *  - quiz: the answer, 1 point or 0;
 *  - code review: the detection points the category's planted issues carried
 *    in that review (CodeReviewScorer::DETECTION_POINTS shared by severity)
 *    and the share of them found;
 *  - system design: the trait's points and its weight, as scored.
 *
 * Nothing here is an answer key: no option, planted issue or key point, so
 * the response is safe whatever the user has or has not answered. The quiz
 * counts published questions only, as its own progress does; a code review
 * or system design attempt carries its feedback, so all of them count.
 */
class PracticeProgressReport
{
    public const WINDOW_DAYS = 30;

    public const RECENT_PER_AREA = 10;

    public function __construct(private readonly PracticeHistory $history) {}

    /** @return array<string, mixed> */
    public function for(User $user): array
    {
        $since = now()->subDays(self::WINDOW_DAYS);

        return [
            'windowDays' => self::WINDOW_DAYS,
            'since' => $since->toJSON(),
            'quiz' => $this->quiz($user, $since),
            'codeReview' => $this->codeReview($user, $since),
            'systemDesign' => $this->systemDesign($user, $since),
        ];
    }

    /** @return array<string, mixed> */
    private function quiz(User $user, CarbonInterface $since): array
    {
        $questions = PracticeQuestion::query()
            ->servable(PracticeKind::Quiz)
            ->get(['id', 'language', 'topic'])
            ->keyBy('id');

        $attempts = $this->attempts($user, PracticeKind::Quiz)
            ->filter(fn (PracticeAttempt $a) => $questions->has($a->practice_question_id))
            ->values();

        $mistakes = $this->history->latestAttempts($user, PracticeKind::Quiz)
            ->filter(fn (PracticeAttempt $a) => $a->correct === false && $questions->has($a->practice_question_id))
            ->map(fn (PracticeAttempt $a) => $questions->get($a->practice_question_id));

        $in = fn (PracticeLanguage $language, ?string $topic = null) => function (PracticeQuestion|PracticeAttempt $item) use ($questions, $language, $topic): bool {
            $question = $item instanceof PracticeQuestion ? $item : $questions->get($item->practice_question_id);

            return $question->language === $language && ($topic === null || $question->topic === $topic);
        };

        $tally = function (Collection $answers) use ($since): array {
            $window = $answers->filter(fn (PracticeAttempt $a) => $a->created_at >= $since);
            $answered = $window->count();
            $correct = $window->where('correct', true)->count();

            return [
                'answered' => $answered,
                'correct' => $correct,
                'accuracy' => $answered > 0 ? (int) round($correct * 100 / $answered) : null,
            ];
        };

        $languages = array_map(function (PracticeLanguage $language) use ($attempts, $mistakes, $in, $tally): array {
            $topics = [];
            foreach ($language->topics() as $key => $label) {
                $answers = $attempts->filter($in($language, $key));
                $topics[] = [
                    'key' => $key,
                    'label' => $label,
                    ...$tally($answers),
                    'openMistakes' => $mistakes->filter($in($language, $key))->count(),
                    'recent' => $this->recent($answers),
                ];
            }

            return [
                'key' => $language->value,
                'label' => $language->label(),
                ...$tally($attempts->filter($in($language))),
                'openMistakes' => $mistakes->filter($in($language))->count(),
                'topics' => $topics,
            ];
        }, PracticeLanguage::cases());

        return [
            ...$this->summary(PracticeKind::Quiz, $attempts, $since),
            'openMistakes' => $mistakes->count(),
            'languages' => $languages,
        ];
    }

    /** @return array<string, mixed> */
    private function codeReview(User $user, CarbonInterface $since): array
    {
        $attempts = $this->attempts($user, PracticeKind::CodeReview, withFeedback: true);

        $categories = array_map(function (CodeReviewCategory $category) use ($attempts, $since): array {
            $planted = 0;
            $found = 0;
            $recent = [];

            foreach ($attempts as $attempt) {
                $issues = $this->issues($attempt);
                $mine = array_filter($issues, fn (array $issue) => $issue['category'] === $category->value);
                if ($mine === []) {
                    continue;
                }

                if ($attempt->created_at >= $since) {
                    $planted += count($mine);
                    $found += count(array_filter($mine, fn (array $issue) => $issue['found']));
                }

                if (count($recent) < self::RECENT_PER_AREA) {
                    $severity = array_sum(array_column($issues, 'severity'));
                    $share = fn (array $some) => $severity > 0
                        ? round(CodeReviewScorer::DETECTION_POINTS * array_sum(array_column($some, 'severity')) / $severity, 1)
                        : 0;
                    $recent[] = [
                        'at' => $attempt->created_at->toJSON(),
                        'points' => $share(array_filter($mine, fn (array $issue) => $issue['found'])),
                        'maxPoints' => $share($mine),
                    ];
                }
            }

            return [
                'key' => $category->value,
                'label' => $category->label(),
                'planted' => $planted,
                'found' => $found,
                'foundRate' => $planted > 0 ? (int) round($found * 100 / $planted) : null,
                'recent' => $recent,
            ];
        }, CodeReviewCategory::cases());

        return [
            ...$this->summary(PracticeKind::CodeReview, $attempts, $since),
            'categories' => $categories,
        ];
    }

    /** @return array<string, mixed> */
    private function systemDesign(User $user, CarbonInterface $since): array
    {
        $attempts = $this->attempts($user, PracticeKind::SystemDesign, withFeedback: true);

        $traits = [];
        foreach (SystemDesignRubric::TRAITS as $key => $trait) {
            $points = [];
            $recent = [];

            foreach ($attempts as $attempt) {
                $rated = collect($attempt->feedback['traits'] ?? [])->firstWhere('key', $key);
                if (! is_array($rated)) {
                    continue;
                }

                $earned = max(0, (int) ($rated['points'] ?? 0));
                if ($attempt->created_at >= $since) {
                    $points[] = $earned;
                }
                if (count($recent) < self::RECENT_PER_AREA) {
                    $recent[] = [
                        'at' => $attempt->created_at->toJSON(),
                        'points' => $earned,
                        'maxPoints' => (int) ($rated['maxPoints'] ?? $trait['weight']),
                    ];
                }
            }

            $average = $points === [] ? null : array_sum($points) / count($points);

            $traits[] = [
                'key' => $key,
                'label' => $trait['label'],
                'maxPoints' => $trait['weight'],
                'attempts' => count($points),
                'averagePoints' => $average === null ? null : round($average, 1),
                'average' => $average === null ? null : (int) round($average * 100 / $trait['weight']),
                'recent' => $recent,
            ];
        }

        return [
            ...$this->summary(PracticeKind::SystemDesign, $attempts, $since),
            'traits' => $traits,
        ];
    }

    /**
     * The user's attempts of a kind, newest first.
     *
     * @return Collection<int, PracticeAttempt>
     */
    private function attempts(User $user, PracticeKind $kind, bool $withFeedback = false): Collection
    {
        $columns = ['id', 'practice_question_id', 'score', 'max_score', 'correct', 'created_at'];

        return $user->practiceAttempts()
            ->where('kind', $kind)
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get($withFeedback ? [...$columns, 'feedback'] : $columns);
    }

    /**
     * Attempts and the average score, as a percentage, over the window; and
     * when the mode was last practised.
     *
     * @param  Collection<int, PracticeAttempt>  $attempts  newest first
     * @return array{kind: string, attempts: int, averageScore: int|null, lastAttemptAt: string|null}
     */
    private function summary(PracticeKind $kind, Collection $attempts, CarbonInterface $since): array
    {
        $window = $attempts->filter(fn (PracticeAttempt $a) => $a->created_at >= $since);
        $percents = $window->map(fn (PracticeAttempt $a) => $a->max_score > 0 ? $a->score * 100 / $a->max_score : 0);

        return [
            'kind' => $kind->value,
            'attempts' => $window->count(),
            'averageScore' => $percents->isEmpty() ? null : (int) round($percents->avg()),
            'lastAttemptAt' => $attempts->first()?->created_at?->toJSON(),
        ];
    }

    /**
     * An area's latest results, newest first.
     *
     * @param  Collection<int, PracticeAttempt>  $attempts  newest first
     * @return list<array{at: string, points: int, maxPoints: int}>
     */
    private function recent(Collection $attempts): array
    {
        return $attempts
            ->take(self::RECENT_PER_AREA)
            ->map(fn (PracticeAttempt $a) => ['at' => $a->created_at->toJSON(), 'points' => $a->score, 'maxPoints' => $a->max_score])
            ->values()
            ->all();
    }

    /**
     * The planted issues a review's feedback recorded, each with its
     * category, severity and whether it was found. Anything malformed is
     * skipped rather than counted.
     *
     * @return list<array{category: string, severity: int, found: bool}>
     */
    private function issues(PracticeAttempt $attempt): array
    {
        $issues = [];
        foreach ($attempt->feedback['issues'] ?? [] as $issue) {
            if (! is_array($issue) || ! is_string($issue['category'] ?? null)) {
                continue;
            }
            $issues[] = [
                'category' => $issue['category'],
                'severity' => max(0, (int) ($issue['severity'] ?? 0)),
                'found' => ($issue['found'] ?? false) === true,
            ];
        }

        return $issues;
    }
}
