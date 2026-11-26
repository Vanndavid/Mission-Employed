<?php

namespace App\Services\Practice;

use App\Enums\PracticeKind;

/**
 * The checks one {@see PracticeKind}'s questions pass before they are saved,
 * whoever wrote them: an AI draft on the way in, and every admin edit after
 * that, publishing included. A kind with no validator cannot be edited on the
 * question bank. Registered through its {@see DraftKind}.
 */
interface DraftValidator
{
    /**
     * Tidy practice_questions columns, from the model or an admin, without
     * judging them: trim text, and turn values of the wrong type into null
     * or '' so that errors() can say what is missing. Never throws. Returns
     * the content columns this kind owns, and only those.
     *
     * @param  array<string, mixed>  $question
     * @return array<string, mixed>
     */
    public function normalize(array $question): array;

    /**
     * Everything wrong with a normalized question, as field => one sentence
     * an admin can act on. Empty when it can be saved.
     *
     * @param  array<string, mixed>  $question
     * @param  array<string, mixed>  $expected  Columns it must match, such as
     *                                          the language and topic a draft
     *                                          was asked for. Empty for an edit.
     * @return array<string, string>
     */
    public function errors(array $question, array $expected = []): array;
}
