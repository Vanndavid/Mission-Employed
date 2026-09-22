<?php

namespace App\Models;

use App\Enums\JobStatus;
use Database\Factories\ApplicationFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Application extends Model
{
    /** @use HasFactory<ApplicationFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'user_id',
        'company',
        'role',
        'location',
        'url',
        'status',
        'is_important',
        'date_applied',
        'notes',
        'job_description',
        'cover_letter',
        'tailored_cv',
        'next_action',
        'next_action_due',
        'recruiter_name',
        'recruiter_email',
        'recruiter_linkedin',
        'offer',
        'take_home',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'status' => JobStatus::class,
            'is_important' => 'boolean',
            'date_applied' => 'date',
            'next_action_due' => 'date',
            'offer' => 'array',
            'take_home' => 'array',
        ];
    }

    /**
     * The frontend's RecruiterContact object, rebuilt from the three flat
     * columns: null when nothing has been recorded, otherwise every key
     * present (blank rather than missing) so the client can render a form.
     *
     * Controllers should read recruiter data through this one accessor rather
     * than re-deriving the null case per endpoint.
     *
     * @return Attribute<array{name: string, email: string, linkedin: string}|null, never>
     */
    protected function recruiterContact(): Attribute
    {
        return Attribute::make(
            get: function (): ?array {
                $parts = [
                    'name' => $this->recruiter_name,
                    'email' => $this->recruiter_email,
                    'linkedin' => $this->recruiter_linkedin,
                ];

                // Blank strings count as absent — the client sends '' for
                // untouched inputs.
                if (! collect($parts)->contains(fn ($value) => filled($value))) {
                    return null;
                }

                return array_map(fn ($value) => (string) ($value ?? ''), $parts);
            },
        );
    }

    public function hasRecruiter(): bool
    {
        return $this->recruiter_contact !== null;
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return HasMany<InterviewStage, $this> */
    public function interviewStages(): HasMany
    {
        return $this->hasMany(InterviewStage::class)->orderBy('scheduled_at');
    }

    /** @return HasMany<ApplicationStatusEvent, $this> */
    public function statusEvents(): HasMany
    {
        return $this->hasMany(ApplicationStatusEvent::class)->orderBy('occurred_at');
    }
}
