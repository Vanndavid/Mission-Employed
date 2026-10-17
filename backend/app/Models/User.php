<?php

namespace App\Models;

use App\Enums\AccountPlan;
use App\Enums\AccountRole;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The API is stateless (Sanctum bearer tokens), so there is no
     * remember_token column to cycle.
     */
    protected $rememberTokenName = '';

    /**
     * Rows-per-page choices for the applications table. Mirrors
     * APPLICATIONS_PAGE_SIZES in frontend/utils/applicationTable.ts.
     *
     * @var list<int>
     */
    public const APPLICATIONS_PAGE_SIZES = [5, 10, 25, 50, 100];

    /**
     * What a preference reads as until the user changes it.
     *
     * @var array{applicationsPageSize: int}
     */
    public const DEFAULT_PREFERENCES = [
        'applicationsPageSize' => 5,
    ];

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    /**
     * The users table defaults role and plan, but a database default does not
     * reach the in-memory model until it is refreshed -- so a freshly created
     * User had null for both, and UserResource reading $this->role->value blew
     * up on registration. Declaring them here keeps a new instance consistent
     * with a stored one, and keeps isPremium() honest before the first save.
     *
     * @var array<string, string>
     */
    protected $attributes = [
        'role' => AccountRole::User->value,
        'plan' => AccountPlan::Free->value,
    ];

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'plan',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'role' => AccountRole::class,
            'plan' => AccountPlan::class,
            // Deliberately not fillable: only the admin route sets it.
            'deactivated_at' => 'datetime',
            // Not fillable either: the admin plan route sets the end date, and
            // the account's own Request Premium button sets the request.
            'plan_expires_at' => 'datetime',
            'premium_requested_at' => 'datetime',
            // Deliberately not fillable: only PreferencesController writes it.
            'preferences' => 'array',
        ];
    }

    /** @return HasOne<Profile, $this> */
    public function profile(): HasOne
    {
        return $this->hasOne(Profile::class);
    }

    /** @return HasMany<Application, $this> */
    public function applications(): HasMany
    {
        return $this->hasMany(Application::class);
    }

    /** @return HasMany<CodingAttempt, $this> */
    public function codingAttempts(): HasMany
    {
        return $this->hasMany(CodingAttempt::class);
    }

    /** @return HasMany<BehavioralAnswer, $this> */
    public function behavioralAnswers(): HasMany
    {
        return $this->hasMany(BehavioralAnswer::class)->orderBy('theme_id');
    }

    /** @return HasMany<AiSession, $this> */
    public function aiSessions(): HasMany
    {
        return $this->hasMany(AiSession::class);
    }

    /** @return HasMany<FeatureUsage, $this> */
    public function featureUsages(): HasMany
    {
        return $this->hasMany(FeatureUsage::class);
    }

    public function isAdmin(): bool
    {
        return $this->role === AccountRole::Admin;
    }

    /**
     * Matches isPremiumUser() in frontend/types/auth.ts, which reads the
     * effective plan this decides: admins are always premium, everyone else
     * needs the premium plan, and one with an end date stops at that moment.
     */
    public function isPremium(): bool
    {
        return $this->isAdmin() || ($this->plan === AccountPlan::Premium && ! $this->premiumHasLapsed());
    }

    /** A Premium plan whose end date has passed. Free plans never lapse. */
    public function premiumHasLapsed(): bool
    {
        return $this->plan === AccountPlan::Premium
            && $this->plan_expires_at !== null
            && $this->plan_expires_at->lessThanOrEqualTo(now());
    }

    /**
     * A deactivated account keeps its data but cannot sign in, and any token
     * it holds is refused (see AppServiceProvider::boot).
     */
    public function isDeactivated(): bool
    {
        return $this->deactivated_at !== null;
    }

    /**
     * Lock the account and sign it out everywhere, MCP connectors included.
     * Deactivating again keeps the original date.
     */
    public function deactivate(): void
    {
        DB::transaction(function (): void {
            $this->deactivated_at ??= now();
            $this->save();
            $this->tokens()->delete();
        });
    }

    public function reactivate(): void
    {
        $this->deactivated_at = null;
        $this->save();
    }

    /**
     * Every preference, defaults filled in. A stored value that is no longer
     * offered (the choices changed since it was saved) reads as the default.
     *
     * @return array{applicationsPageSize: int}
     */
    public function effectivePreferences(): array
    {
        $stored = $this->preferences ?? [];
        $preferences = self::DEFAULT_PREFERENCES;

        if (in_array($stored['applicationsPageSize'] ?? null, self::APPLICATIONS_PAGE_SIZES, true)) {
            $preferences['applicationsPageSize'] = $stored['applicationsPageSize'];
        }

        return $preferences;
    }

    /**
     * The plan the client should see and every feature check uses — admins
     * read back as premium, and a lapsed premium plan as free.
     */
    public function effectivePlan(): AccountPlan
    {
        return $this->isPremium() ? AccountPlan::Premium : AccountPlan::Free;
    }
}
