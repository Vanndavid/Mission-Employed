<?php

namespace App\Enums;

use App\Console\Commands\SyncPracticeBank;

/**
 * Who wrote a question. `practice:sync` ({@see SyncPracticeBank}) owns the
 * seed rows and nothing else: it never touches a question an admin wrote or
 * an AI drafted. For that reason seed rows are read-only on the admin's
 * question bank (a 422): a seeded question is fixed in its JSON file, or the
 * next deploy would put the file's version back. An AI draft an admin edits
 * stays `ai`.
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
