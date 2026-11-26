<?php

namespace App\Models;

use App\Enums\PracticeKind;
use Database\Factories\PracticeAttemptFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One answer to a practice question, append-only. A user's open mistakes are
 * the questions whose latest attempt is wrong; nothing else is stored about
 * them.
 *
 * @property PracticeKind $kind
 * @property array<string, mixed> $response
 * @property array<string, mixed>|null $feedback
 */
class PracticeAttempt extends Model
{
    /** @use HasFactory<PracticeAttemptFactory> */
    use HasFactory;

    /** Append-only. */
    public const UPDATED_AT = null;

    /** @var list<string> */
    protected $fillable = [
        'user_id',
        'practice_question_id',
        'kind',
        'response',
        'score',
        'max_score',
        'correct',
        'feedback',
        'rubric_version',
        'created_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'kind' => PracticeKind::class,
            'response' => 'array',
            'score' => 'integer',
            'max_score' => 'integer',
            'correct' => 'boolean',
            'feedback' => 'array',
            'created_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<PracticeQuestion, $this> */
    public function question(): BelongsTo
    {
        return $this->belongsTo(PracticeQuestion::class, 'practice_question_id');
    }
}
