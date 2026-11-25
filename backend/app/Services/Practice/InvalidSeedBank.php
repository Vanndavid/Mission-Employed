<?php

namespace App\Services\Practice;

use RuntimeException;

/**
 * The seed bank has at least one question that must not be published. Carries
 * every problem found, not just the first, so one run lists them all.
 */
class InvalidSeedBank extends RuntimeException
{
    /** @param  list<string>  $problems */
    public function __construct(public readonly array $problems)
    {
        parent::__construct('The practice seed bank is invalid: '.implode('; ', $problems));
    }
}
