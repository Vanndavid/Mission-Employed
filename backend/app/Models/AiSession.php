<?php

namespace App\Models;

use Database\Factories\AiSessionFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Replaces the Express `chatSessions = new Map()`, which lost every
 * conversation on restart.
 */
class AiSession extends Model
{
    /** @use HasFactory<AiSessionFactory> */
    use HasFactory;

    /** @var list<string> */
    public const KINDS = ['coding', 'behavioral', 'mock', 'cover_letter', 'cv'];

    /** @var list<string> */
    protected $fillable = [
        'user_id',
        'kind',
        'system_instruction',
        'context',
        'report',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'context' => 'array',
            'report' => 'array',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<AiMessage, $this> */
    public function messages(): HasMany
    {
        return $this->hasMany(AiMessage::class)->orderBy('sequence');
    }

    /** The sequence number the next appended message should use. */
    public function nextSequence(): int
    {
        return (int) $this->messages()->max('sequence') + 1;
    }
}
