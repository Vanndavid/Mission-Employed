<?php

namespace App\Models;

use App\Enums\Feature;
use App\Enums\QuotaPeriod;
use App\Services\Plans\FeatureSetting;
use Database\Factories\PlanFeatureFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * An admin's setting for one feature on one plan. With no row, the feature
 * reads as Feature::defaultSetting() for that plan.
 */
class PlanFeature extends Model
{
    /** @use HasFactory<PlanFeatureFactory> */
    use HasFactory;

    /** @var list<string> */
    protected $fillable = [
        'plan',
        'feature',
        'enabled',
        'quota',
        'period',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'feature' => Feature::class,
            'enabled' => 'boolean',
            'quota' => 'integer',
            'period' => QuotaPeriod::class,
        ];
    }

    public function toSetting(): FeatureSetting
    {
        return new FeatureSetting($this->feature, $this->enabled, $this->quota, $this->period);
    }
}
