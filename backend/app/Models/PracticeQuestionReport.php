<?php

namespace App\Models;

use Database\Factories\PracticeQuestionReportFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A user saying a practice question is wrong, and why. Open until an admin
 * resolves the question's reports on the question bank. One row per user per
 * question: reporting again after a resolution reopens it.
 */
class PracticeQuestionReport extends Model
{
    /** @use HasFactory<PracticeQuestionReportFactory> */
    use HasFactory;

    public const MAX_REASON_LENGTH = 1000;

    /** @var list<string> */
    protected $fillable = [
        'practice_question_id',
        'user_id',
        'reason',
        'resolved_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'resolved_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<PracticeQuestion, $this> */
    public function question(): BelongsTo
    {
        return $this->belongsTo(PracticeQuestion::class, 'practice_question_id');
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @param  Builder<self>  $query */
    public function scopeOpen(Builder $query): void
    {
        $query->whereNull('resolved_at');
    }
}
