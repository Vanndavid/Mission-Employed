<?php

namespace App\Enums;

use App\Models\Plan;

/**
 * Mirrors AccountPlan in frontend/types/auth.ts.
 *
 * The defaults here are what a plan reads as until an admin edits it
 * ({@see Plan::resolve()}).
 */
enum AccountPlan: string
{
    case Free = 'free';
    case Premium = 'premium';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }

    public function label(): string
    {
        return match ($this) {
            self::Free => 'Free',
            self::Premium => 'Premium',
        };
    }

    public function defaultDescription(): string
    {
        return match ($this) {
            self::Free => 'The application tracker, spreadsheet import and export, coding history and Seek job search.',
            self::Premium => 'Everything in Free, plus the AI tools: tailored CVs and cover letters, ATS checks, a coding tutor, interview practice and mock interviews.',
        };
    }

    /** All metered features combined, so a script cannot burn a day's allowance in seconds. */
    public function defaultRequestsPerMinute(): int
    {
        return match ($this) {
            self::Free => 10,
            self::Premium => 30,
        };
    }
}
