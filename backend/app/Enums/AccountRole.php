<?php

namespace App\Enums;

/** Mirrors AccountRole in frontend/types/auth.ts. */
enum AccountRole: string
{
    case User = 'user';
    case Admin = 'admin';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }
}
