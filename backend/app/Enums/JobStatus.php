<?php

namespace App\Enums;

/**
 * Mirrors the JobStatus enum in frontend/types.ts — the stored values are the
 * exact strings the React client sends and renders.
 */
enum JobStatus: string
{
    case Saved = 'Saved';
    case Applied = 'Applied';
    case Interviewing = 'Interviewing';
    case Offer = 'Offer';
    case Rejected = 'Rejected';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }
}
