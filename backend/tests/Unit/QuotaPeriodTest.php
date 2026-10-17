<?php

namespace Tests\Unit;

use App\Enums\QuotaPeriod;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\TestCase;

/**
 * Quotas run on calendar periods in the app's timezone (UTC), so "20 a day"
 * resets at midnight rather than 24 hours after a user's first request.
 */
class QuotaPeriodTest extends TestCase
{
    public function test_a_day_runs_midnight_to_midnight(): void
    {
        $now = Carbon::parse('2026-10-17 15:42:10', 'UTC');

        $this->assertSame('2026-10-17 00:00:00', QuotaPeriod::Day->start($now)->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-18 00:00:00', QuotaPeriod::Day->resetsAt($now)->format('Y-m-d H:i:s'));
    }

    public function test_a_week_starts_on_monday(): void
    {
        // A Saturday.
        $now = Carbon::parse('2026-10-17 15:42:10', 'UTC');

        $this->assertSame('2026-10-12 00:00:00', QuotaPeriod::Week->start($now)->format('Y-m-d H:i:s'));
        $this->assertSame('2026-10-19 00:00:00', QuotaPeriod::Week->resetsAt($now)->format('Y-m-d H:i:s'));
    }

    public function test_a_month_starts_on_the_first(): void
    {
        $now = Carbon::parse('2026-12-31 23:59:59', 'UTC');

        $this->assertSame('2026-12-01 00:00:00', QuotaPeriod::Month->start($now)->format('Y-m-d H:i:s'));
        $this->assertSame('2027-01-01 00:00:00', QuotaPeriod::Month->resetsAt($now)->format('Y-m-d H:i:s'));
    }

    public function test_it_does_not_move_the_clock_it_was_given(): void
    {
        $now = Carbon::parse('2026-10-17 15:42:10', 'UTC');

        QuotaPeriod::Month->start($now);
        QuotaPeriod::Month->resetsAt($now);

        $this->assertSame('2026-10-17 15:42:10', $now->format('Y-m-d H:i:s'));
    }
}
