<?php

namespace App\Models;

use Database\Factories\AiUsageFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One Gemini call's token usage and estimated cost. Written by
 * {@see \App\Services\Ai\DatabaseUsageRecorder}, read by the admin usage screen.
 */
class AiUsage extends Model
{
    /** @use HasFactory<AiUsageFactory> */
    use HasFactory;

    protected $table = 'ai_usage';

    /** Append-only. */
    public const UPDATED_AT = null;

    public const SOURCES = ['server', 'live'];

    /** @var list<string> */
    protected $fillable = [
        'user_id',
        'feature',
        'model',
        'source',
        'prompt_tokens',
        'output_tokens',
        'thought_tokens',
        'total_tokens',
        'cost_micros',
        'created_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'prompt_tokens' => 'integer',
            'output_tokens' => 'integer',
            'thought_tokens' => 'integer',
            'total_tokens' => 'integer',
            'cost_micros' => 'float',
            'created_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
