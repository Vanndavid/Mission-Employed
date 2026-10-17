<?php

namespace App\Enums;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * How often a feature's allowance resets. Calendar periods in the app's
 * timezone (UTC), so "20 a day" comes back at midnight rather than 24 hours
 * after someone's first request. Mirrors QuotaPeriod in frontend/types/auth.ts.
 */
enum QuotaPeriod: string
{
    case Day = 'day';
    case Week = 'week';
    case Month = 'month';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }

    /** When the period containing $now began. */
    public function start(?CarbonInterface $now = null): CarbonImmutable
    {
        $now = CarbonImmutable::instance($now ?? now());

        return match ($this) {
            self::Day => $now->startOfDay(),
            self::Week => $now->startOfWeek(CarbonInterface::MONDAY),
            self::Month => $now->startOfMonth(),
        };
    }

    /** When the period containing $now ends and the allowance comes back. */
    public function resetsAt(?CarbonInterface $now = null): CarbonImmutable
    {
        $start = $this->start($now);

        return match ($this) {
            self::Day => $start->addDay(),
            self::Week => $start->addWeek(),
            self::Month => $start->addMonthNoOverflow(),
        };
    }
}
