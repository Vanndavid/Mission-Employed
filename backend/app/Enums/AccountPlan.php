<?php

namespace App\Enums;

/** Mirrors AccountPlan in frontend/types/auth.ts. */
enum AccountPlan: string
{
    case Free = 'free';
    case Premium = 'premium';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }
}
