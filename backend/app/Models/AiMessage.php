<?php

namespace App\Models;

use Database\Factories\AiMessageFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiMessage extends Model
{
    /** @use HasFactory<AiMessageFactory> */
    use HasFactory;

    /**
     * Gemini's role vocabulary — 'model' rather than 'assistant'.
     *
     * @var list<string>
     */
    public const ROLES = ['user', 'model'];

    /** @var list<string> */
    protected $fillable = [
        'ai_session_id',
        'role',
        'content',
        'sequence',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'sequence' => 'integer',
        ];
    }

    /** @return BelongsTo<AiSession, $this> */
    public function session(): BelongsTo
    {
        return $this->belongsTo(AiSession::class, 'ai_session_id');
    }
}
