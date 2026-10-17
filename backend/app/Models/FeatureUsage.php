<?php

namespace App\Models;

use App\Enums\Feature;
use App\Http\Middleware\EnsureFeature;
use Database\Factories\FeatureUsageFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One use of a metered feature, written by {@see EnsureFeature} and counted
 * against the plan's quota. Separate from ai_usage, which records tokens per
 * model call for the cost screen: a use here is what the plan promises, and a
 * request that fails or is waived (a cached ATS re-check) leaves no row.
 */
class FeatureUsage extends Model
{
    /** @use HasFactory<FeatureUsageFactory> */
    use HasFactory;

    /** Append-only. */
    public const UPDATED_AT = null;

    /** @var list<string> */
    protected $fillable = [
        'user_id',
        'feature',
        'created_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'feature' => Feature::class,
            'created_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
