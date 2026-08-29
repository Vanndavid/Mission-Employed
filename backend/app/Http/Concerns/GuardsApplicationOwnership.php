<?php

namespace App\Http\Concerns;

use App\Models\Application;
use App\Models\User;

/**
 * One ownership rule for everything hanging off an application.
 *
 * It aborts with 404, never 403: whether another user's application exists is
 * itself information, so "not yours" and "not there" must be the same answer.
 *
 * Form requests use it too, so validation errors on someone else's record
 * cannot answer the question a 404 refuses to.
 */
trait GuardsApplicationOwnership
{
    protected function guardApplicationOwnership(mixed $application, ?User $user): void
    {
        abort_if(
            ! $application instanceof Application
            || $user === null
            || $application->user_id !== $user->id,
            404
        );
    }
}
