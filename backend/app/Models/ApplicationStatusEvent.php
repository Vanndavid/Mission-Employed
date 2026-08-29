<?php

namespace App\Models;

use App\Enums\JobStatus;
use Database\Factories\ApplicationStatusEventFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApplicationStatusEvent extends Model
{
    /** @use HasFactory<ApplicationStatusEventFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'application_id',
        'status',
        'occurred_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'status' => JobStatus::class,
            'occurred_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Application, $this> */
    public function application(): BelongsTo
    {
        return $this->belongsTo(Application::class);
    }
}
