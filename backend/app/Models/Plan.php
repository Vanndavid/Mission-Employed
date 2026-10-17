<?php

namespace App\Models;

use App\Enums\AccountPlan;
use Database\Factories\PlanFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * An admin's edits to one AccountPlan: what it is called, the price shown for
 * it, and its requests-per-minute cap. Rows exist only for plans an admin has
 * saved; {@see self::resolve()} fills the rest from AccountPlan's defaults.
 * What the plan includes lives in {@see PlanFeature}.
 */
class Plan extends Model
{
    /** @use HasFactory<PlanFactory> */
    use HasFactory;

    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    /** @var list<string> */
    protected $fillable = [
        'key',
        'name',
        'price_label',
        'description',
        'requests_per_minute',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'requests_per_minute' => 'integer',
        ];
    }

    /** The stored plan, or an unsaved one holding the defaults. */
    public static function resolve(AccountPlan $plan): self
    {
        return static::find($plan->value) ?? new static([
            'key' => $plan->value,
            'name' => $plan->label(),
            'price_label' => null,
            'description' => $plan->defaultDescription(),
            'requests_per_minute' => $plan->defaultRequestsPerMinute(),
        ]);
    }

    public function accountPlan(): AccountPlan
    {
        return AccountPlan::from($this->key);
    }
}
