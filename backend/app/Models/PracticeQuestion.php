<?php

namespace App\Models;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Enums\PracticeQuestionSource;
use App\Enums\PracticeQuestionStatus;
use Database\Factories\PracticeQuestionFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A question in the practice bank, for any {@see PracticeKind}.
 *
 * `answer` is the key and is hidden from serialization: only the controller
 * that scores an answer reads it, and only after the user has answered. For
 * the quiz it is {"choice": "<one of the options>"}.
 *
 * @property PracticeKind $kind
 * @property PracticeLanguage|null $language
 * @property PracticeQuestionStatus $status
 * @property PracticeQuestionSource $source
 * @property list<string>|null $options
 * @property array<string, mixed> $answer
 */
class PracticeQuestion extends Model
{
    /** @use HasFactory<PracticeQuestionFactory> */
    use HasFactory;

    /**
     * Mirrors PracticeDifficulty in frontend/types/practice.ts.
     *
     * @var list<string>
     */
    public const DIFFICULTIES = ['easy', 'medium', 'hard'];

    /** @var list<string> */
    protected $fillable = [
        'kind',
        'language',
        'topic',
        'difficulty',
        'prompt',
        'code',
        'options',
        'answer',
        'explanation',
        'status',
        'source',
        'external_id',
    ];

    /**
     * A safety net: resources choose what goes out, but a question that ever
     * reaches toArray() still does not carry its key.
     *
     * @var list<string>
     */
    protected $hidden = ['answer'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'kind' => PracticeKind::class,
            'language' => PracticeLanguage::class,
            'status' => PracticeQuestionStatus::class,
            'source' => PracticeQuestionSource::class,
            'options' => 'array',
            'answer' => 'array',
        ];
    }

    /** @return HasMany<PracticeAttempt, $this> */
    public function attempts(): HasMany
    {
        return $this->hasMany(PracticeAttempt::class);
    }

    /**
     * What a user can be served: published questions of one kind.
     *
     * @param  Builder<self>  $query
     */
    public function scopeServable(Builder $query, PracticeKind $kind): void
    {
        $query->where('kind', $kind)->where('status', PracticeQuestionStatus::Published);
    }

    /** The quiz's right option. */
    public function correctChoice(): ?string
    {
        $choice = $this->answer['choice'] ?? null;

        return is_string($choice) ? $choice : null;
    }

    /**
     * Score a quiz answer: the option's exact text against the key. A null
     * choice is the timer running out, which is wrong.
     */
    public function isCorrectChoice(?string $choice): bool
    {
        return $choice !== null && $choice === $this->correctChoice();
    }
}
