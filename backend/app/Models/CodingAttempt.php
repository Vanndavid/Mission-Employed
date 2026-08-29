<?php

namespace App\Models;

use Database\Factories\CodingAttemptFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CodingAttempt extends Model
{
    /** @use HasFactory<CodingAttemptFactory> */
    use HasFactory;

    /**
     * Mirrors CodingHistoryEntry['difficulty'] in frontend/types.ts.
     *
     * @var list<string>
     */
    public const DIFFICULTIES = ['easy', 'medium', 'hard'];

    /** @var list<string> */
    protected $fillable = [
        'user_id',
        'title',
        'difficulty',
        'topics',
        'completed',
        'attempted_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'topics' => 'array',
            'completed' => 'boolean',
            'attempted_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
