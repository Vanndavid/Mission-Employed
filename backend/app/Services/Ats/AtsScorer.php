<?php

namespace App\Services\Ats;

/**
 * Scores a CV against a job's keywords the way an applicant tracking system's
 * keyword screen would: literally, by whether the words are there.
 *
 * Deliberately deterministic, with no model call. The AI's only job is to read
 * the job description and hand over its vocabulary ({@see AtsCheck}); this class
 * decides the number. The same keywords and CV always give the same report, so
 * a user can edit their CV and re-check without the score drifting for reasons
 * they cannot see.
 *
 * The score is 80 points of weighted keyword coverage plus 20 points of format
 * checks, four each.
 *
 * @phpstan-type Keyword array{term: string, aliases: list<string>, kind: string, required: bool}
 * @phpstan-type Check array{id: string, label: string, passed: bool, detail: string}
 */
class AtsScorer
{
    public const KEYWORD_POINTS = 80;

    public const FORMAT_POINTS = 20;

    public const MIN_WORDS = 300;

    public const MAX_WORDS = 1000;

    public const MIN_MEASURABLE = 3;

    /** Heading words for the three sections every ATS parser looks for. */
    private const SECTIONS = [
        'Experience' => ['experience', 'employment', 'work history', 'career history', 'professional background'],
        'Education' => ['education', 'qualifications', 'academic'],
        'Skills' => ['skills', 'technologies', 'tech stack', 'technical proficiencies', 'competencies'],
    ];

    /** Dropped from a job title before the second, looser title match. */
    private const SENIORITY = [
        'senior', 'sr', 'junior', 'jr', 'lead', 'principal', 'staff', 'mid', 'level',
        'graduate', 'grad', 'intern', 'associate', 'entry', 'i', 'ii', 'iii', 'iv',
    ];

    /**
     * @param  list<Keyword>  $keywords
     * @return array{
     *     score: int,
     *     keywords: array{matched: int, total: int},
     *     matched: list<array{term: string, kind: string, required: bool}>,
     *     missing: list<array{term: string, kind: string, required: bool}>,
     *     checks: list<Check>,
     * }
     */
    public function score(array $keywords, string $cv, string $role): array
    {
        $matched = [];
        $missing = [];
        $matchedWeight = 0.0;
        $totalWeight = 0.0;

        foreach ($keywords as $keyword) {
            $weight = ($keyword['required'] ? 2.0 : 1.0) * ($keyword['kind'] === 'soft_skill' ? 0.5 : 1.0);
            $totalWeight += $weight;

            $summary = ['term' => $keyword['term'], 'kind' => $keyword['kind'], 'required' => $keyword['required']];

            if ($this->mentionsAny($cv, [$keyword['term'], ...$keyword['aliases']])) {
                $matched[] = $summary;
                $matchedWeight += $weight;
            } else {
                $missing[] = $summary;
            }
        }

        // Required first, otherwise in the order the job listed them.
        usort($missing, fn (array $a, array $b) => $b['required'] <=> $a['required']);

        $checks = [
            $this->contactCheck($cv),
            $this->sectionsCheck($cv),
            $this->titleCheck($cv, $role),
            $this->lengthCheck($cv),
            $this->measurableCheck($cv),
        ];

        $coverage = $totalWeight > 0 ? $matchedWeight / $totalWeight : 0.0;
        $passed = count(array_filter($checks, fn (array $check) => $check['passed']));

        return [
            'score' => (int) round(self::KEYWORD_POINTS * $coverage + self::FORMAT_POINTS * $passed / count($checks)),
            'keywords' => ['matched' => count($matched), 'total' => count($keywords)],
            'matched' => $matched,
            'missing' => $missing,
            'checks' => $checks,
        ];
    }

    /**
     * Whether the CV contains the term as a whole token.
     *
     * - Word boundaries apply only where the term itself starts or ends with a
     *   letter or digit, so `C++`, `C#` and `.NET` (inside ASP.NET) match, and
     *   `Java` does not match inside JavaScript.
     * - A trailing `+` or `#` extends a word, so `C` is not found in `C++`.
     * - Space and hyphen are interchangeable, and any dash counts as a hyphen.
     * - A term longer than two characters may take a plural `s` or `es` and
     *   matches in any case. A shorter one (`Go`, `R`, `C`) matches only as
     *   written, or every "go live" would count.
     */
    public function mentions(string $cv, string $term): bool
    {
        $term = trim($this->normalise($term));

        if ($term === '') {
            return false;
        }

        $parts = preg_split('/[\s-]+/u', $term, -1, PREG_SPLIT_NO_EMPTY) ?: [$term];
        $body = implode('[\s-]+', array_map(fn (string $part) => preg_quote($part, '/'), $parts));
        $short = mb_strlen($term) <= 2;

        $before = preg_match('/^[\p{L}\p{N}]/u', $term) ? '(?<![\p{L}\p{N}])' : '';
        $endsInWord = preg_match('/[\p{L}\p{N}]$/u', $term) === 1;
        $plural = $endsInWord && ! $short && preg_match('/\p{L}$/u', $term) ? '(?:e?s)?' : '';
        $after = $endsInWord ? '(?![\p{L}\p{N}+#])' : '';

        return preg_match('/'.$before.$body.$plural.$after.'/u'.($short ? '' : 'i'), $this->normalise($cv)) === 1;
    }

    /** @param  list<string>  $terms */
    private function mentionsAny(string $cv, array $terms): bool
    {
        foreach ($terms as $term) {
            if ($this->mentions($cv, $term)) {
                return true;
            }
        }

        return false;
    }

    /** One kind of dash, one kind of quote. */
    private function normalise(string $text): string
    {
        return str_replace(
            ['‐', '‑', '‒', '–', '—', '―', '‘', '’', '“', '”'],
            ['-', '-', '-', '-', '-', '-', "'", "'", '"', '"'],
            $text,
        );
    }

    /** @return Check */
    private function contactCheck(string $cv): array
    {
        $email = preg_match('/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i', $cv) === 1;
        $phone = $this->hasPhoneNumber($this->normalise($cv));

        $missing = array_keys(array_filter(['email address' => ! $email, 'phone number' => ! $phone]));

        return $this->check(
            'contact',
            'Contact details',
            $missing === [],
            $missing === []
                ? 'Email address and phone number found.'
                : 'No '.$this->list($missing).' found. Put contact details in plain text at the top, where a parser looks for them.',
        );
    }

    /**
     * A run of 9 to 15 digits on one line, allowing the usual separators. A
     * run made only of years ("2019 - 2021 2022") is a date range, not a phone.
     */
    private function hasPhoneNumber(string $cv): bool
    {
        preg_match_all('/\+?\(?\d[\d \t().\-]{6,}\d/', $cv, $candidates);

        foreach ($candidates[0] as $candidate) {
            $digits = strlen((string) preg_replace('/\D/', '', $candidate));

            if ($digits < 9 || $digits > 15) {
                continue;
            }

            preg_match_all('/\d+/', $candidate, $groups);
            $onlyYears = collect($groups[0])->every(fn (string $group) => preg_match('/^(19|20)\d\d$/', $group) === 1);

            if (! $onlyYears) {
                return true;
            }
        }

        return false;
    }

    /** @return Check */
    private function sectionsCheck(string $cv): array
    {
        $headings = collect(preg_split('/\R/u', $cv) ?: [])
            ->map(fn (string $line) => mb_strtolower(trim((string) preg_replace('/^[^\p{L}]+|[\s:]+$/u', '', trim($line)))))
            ->filter(fn (string $line) => $line !== '' && mb_strlen($line) <= 40 && str_word_count($line) <= 4);

        $missing = collect(self::SECTIONS)
            ->reject(fn (array $words) => $headings->contains(
                fn (string $heading) => collect($words)->contains(fn (string $word) => str_contains($heading, $word)),
            ))
            ->keys()
            ->all();

        return $this->check(
            'sections',
            'Standard sections',
            $missing === [],
            $missing === []
                ? 'Experience, Education and Skills headings found.'
                : 'No '.$this->list($missing).' heading found. ATS parsers file your history under these standard headings.',
        );
    }

    /** @return Check */
    private function titleCheck(string $cv, string $role): array
    {
        $role = trim($role);
        $core = trim((string) preg_replace('/\s*\([^)]*\)\s*/', ' ', $role));
        $core = collect(preg_split('/[\s,\/]+/u', $core) ?: [])
            ->reject(fn (string $word) => in_array(mb_strtolower(rtrim($word, '.')), self::SENIORITY, true))
            ->implode(' ');

        $found = match (true) {
            $role === '' => null,
            $this->mentions($cv, $role) => $role,
            $core !== '' && $this->mentions($cv, $core) => $core,
            default => null,
        };
        $passed = $found !== null;

        return $this->check(
            'title',
            'Job title',
            $passed,
            $passed
                ? "Your CV names the role \"{$found}\"."
                : "Your CV never says \"{$role}\". Recruiters often search by job title first, so use it where it is true.",
        );
    }

    /** @return Check */
    private function lengthCheck(string $cv): array
    {
        $words = count(array_filter(
            preg_split('/\s+/u', trim($cv)) ?: [],
            fn (string $word) => preg_match('/[\p{L}\p{N}]/u', $word) === 1,
        ));

        $count = number_format($words).' '.($words === 1 ? 'word' : 'words');

        return $this->check(
            'length',
            'Length',
            $words >= self::MIN_WORDS && $words <= self::MAX_WORDS,
            match (true) {
                $words < self::MIN_WORDS => "{$count}. That is thin for a screen; aim for 400 to 800.",
                $words > self::MAX_WORDS => "{$count}. Trim toward two pages; aim for 400 to 800.",
                default => "{$count}, within the 300 to 1,000 a screen reads comfortably.",
            },
        );
    }

    /**
     * Percentages, money, multipliers, 10k-style counts and 1,000-style numbers.
     *
     * @return Check
     */
    private function measurableCheck(string $cv): array
    {
        $count = preg_match_all(
            '/\d+(?:\.\d+)?\s?%|[$€£]\s?\d[\d,.]*[kmb]?\b|\b\d+(?:\.\d+)?x\b|\b\d+(?:\.\d+)?[km]\b|\b\d{1,3}(?:,\d{3})+\b/iu',
            $cv,
        ) ?: 0;

        $results = $count.' quantified '.($count === 1 ? 'result' : 'results');

        return $this->check(
            'measurable',
            'Measurable results',
            $count >= self::MIN_MEASURABLE,
            $count >= self::MIN_MEASURABLE
                ? "{$results} found."
                : "Only {$results} found. Numbers (40% faster, \$120k saved, 3x coverage) make impact easy to scan.",
        );
    }

    /** @return Check */
    private function check(string $id, string $label, bool $passed, string $detail): array
    {
        return ['id' => $id, 'label' => $label, 'passed' => $passed, 'detail' => $detail];
    }

    /** @param  list<string>  $items */
    private function list(array $items): string
    {
        if (count($items) <= 1) {
            return implode('', $items);
        }

        return implode(', ', array_slice($items, 0, -1)).' or '.end($items);
    }
}
