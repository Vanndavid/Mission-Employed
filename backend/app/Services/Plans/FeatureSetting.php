<?php

namespace App\Services\Plans;

use App\Enums\Feature;
use App\Enums\QuotaPeriod;

/**
 * One plan's terms for one feature: included or not, and how many uses per
 * period. A null limit is unlimited.
 */
final class FeatureSetting
{
    public function __construct(
        public readonly Feature $feature,
        public readonly bool $enabled,
        public readonly ?int $limit,
        public readonly QuotaPeriod $period,
    ) {}

    /** What an admin gets: everything, uncounted against any limit. */
    public static function unlimited(Feature $feature): self
    {
        return new self($feature, true, null, QuotaPeriod::Day);
    }

    /** True when $other lets an account do more of this feature than this does. */
    public function isOutdoneBy(self $other): bool
    {
        if (! $other->enabled) {
            return false;
        }

        if (! $this->enabled) {
            return true;
        }

        // Compare per day so 100 a month does not look bigger than 10 a day.
        return $this->limit !== null
            && ($other->limit === null || $other->perDay() > $this->perDay());
    }

    /** @return array{key: string, enabled: bool, limit: int|null, period: string} */
    public function toArray(): array
    {
        return [
            'key' => $this->feature->value,
            'enabled' => $this->enabled,
            'limit' => $this->limit,
            'period' => $this->period->value,
        ];
    }

    private function perDay(): float
    {
        return $this->limit / match ($this->period) {
            QuotaPeriod::Day => 1,
            QuotaPeriod::Week => 7,
            QuotaPeriod::Month => 30,
        };
    }
}
