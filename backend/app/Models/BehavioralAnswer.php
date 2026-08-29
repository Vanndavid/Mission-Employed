<?php

namespace App\Models;

use Database\Factories\BehavioralAnswerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A user's STAR-style bullets for one behavioral theme. Written by the PrepRoom
 * screen and read back by the full mock interview to ground its questions.
 */
class BehavioralAnswer extends Model
{
    /** @use HasFactory<BehavioralAnswerFactory> */
    use HasFactory;

    /**
     * Mirrors BEHAVIORAL_THEMES in frontend/constants.ts.
     *
     * @var list<string>
     */
    public const THEME_IDS = [
        'weakness',
        'challenge',
        'failure',
        'disagreement',
        'pressure',
        'impact',
    ];

    /** @var list<string> */
    protected $fillable = [
        'user_id',
        'theme_id',
        'bullets',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'bullets' => 'array',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
