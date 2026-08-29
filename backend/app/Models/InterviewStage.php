<?php

namespace App\Models;

use Database\Factories\InterviewStageFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InterviewStage extends Model
{
    /** @use HasFactory<InterviewStageFactory> */
    use HasFactory;

    /**
     * Mirrors InterviewStageType in frontend/types.ts.
     *
     * @var list<string>
     */
    public const TYPES = [
        'phone',
        'technical',
        'system_design',
        'behavioral',
        'onsite',
        'take_home',
    ];

    /** @var list<string> */
    protected $fillable = [
        'application_id',
        'type',
        'scheduled_at',
        'notes',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Application, $this> */
    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }
}
