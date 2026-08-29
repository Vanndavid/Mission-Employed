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

    public function isAdmin(): bool
    {
        return $this->role === AccountRole::Admin;
    }

    /**
     * Matches isPremiumUser() in frontend/types/auth.ts: admins are always
     * premium, everyone else needs the premium plan.
     */
    public function isPremium(): bool
    {
        return $this->plan === AccountPlan::Premium || $this->isAdmin();
    }

    /** The plan the client should see — admins read back as premium. */
    public function effectivePlan(): AccountPlan
    {
        return $this->isPremium() ? AccountPlan::Premium : AccountPlan::Free;
    }
}
