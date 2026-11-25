<?php

namespace App\Enums;

use App\Console\Commands\SyncPracticeBank;

/**
 * Who wrote a question. `practice:sync` ({@see SyncPracticeBank}) owns the
 * seed rows and nothing else: it never touches a question an admin wrote or
 * an AI drafted, so an admin who edits a seeded question should make it
 * theirs (source admin) for the edit to survive the next deploy.
 */
enum PracticeQuestionSource: string
{
    /** Hand-written in backend/resources/practice, synced on every deploy. */
    case Seed = 'seed';
    case Ai = 'ai';
    case Admin = 'admin';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }
}
