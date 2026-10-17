<?php

namespace App\Services\Ats;

use App\Models\Application;
use App\Services\Ai\AtsPrompts;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use Closure;
use Illuminate\Support\Arr;
use Illuminate\Validation\ValidationException;

/**
 * One ATS score check of an application: which CV, which keywords, what score.
 *
 * The model is asked once per job for its keywords. They are cached on the
 * application under a hash of the role and job description, so checking an
 * edited CV again costs nothing, and changing the job asks afresh. The answer
 * is untrusted input and is cleaned by {@see self::sanitise()} before use.
 *
 * The stored report carries hashes of the job and the CV it measured. They
 * never leave the server; {@see self::present()} turns them into `stale`.
 */
class AtsCheck
{
    public const SOURCES = ['tailored', 'base'];

    public const MAX_KEYWORDS = 40;

    public const MAX_TERM_LENGTH = 60;

    public const MAX_ALIASES = 5;

    public function __construct(
        private readonly GeminiClient $gemini,
        private readonly AtsScorer $scorer,
    ) {}

    /**
     * Score the application's CV, store the report, and return it as the
     * client sees it.
     *
     * $beforeAskingModel runs only when the job's keywords are not cached,
     * just before the model is asked. The controller charges the plan's
     * allowance there, so a re-check is free.
     *
     * @param  string|null  $source  'tailored' or 'base'. Null picks the
     *                               tailored CV when there is one.
     * @param  string|null  $baseCv  The owner's profile CV.
     * @param  (Closure(): void)|null  $beforeAskingModel
     * @return array<string, mixed>
     *
     * @throws ValidationException when there is no job description or no CV,
     *                             or the model finds no keywords in the job.
     * @throws GeminiException
     */
    public function run(Application $application, ?string $source, ?string $baseCv, ?Closure $beforeAskingModel = null): array
    {
        if (trim((string) $application->job_description) === '') {
            throw ValidationException::withMessages([
                'jobDescription' => 'Add the job description to this application first. The score is measured against it.',
            ]);
        }

        $source ??= filled($application->tailored_cv) ? 'tailored' : 'base';
        $cv = self::cvFor($application, $source, $baseCv);

        if (trim($cv) === '') {
            throw ValidationException::withMessages([
                'cv' => $source === 'tailored'
                    ? 'This application has no tailored CV yet. Generate one, or check your base CV instead.'
                    : 'Add your base CV in CV & Profile first.',
            ]);
        }

        $jobHash = self::jobHash($application);
        $keywords = $this->keywords($application, $jobHash, $beforeAskingModel);

        $application->forceFill([
            'ats_keywords' => ['hash' => $jobHash, 'keywords' => $keywords],
            'ats_report' => $this->scorer->score($keywords, $cv, $application->role) + [
                'source' => $source,
                'checkedAt' => now()->toJSON(),
                'jdHash' => $jobHash,
                'cvHash' => self::hash($cv),
            ],
        ])->save();

        return self::present($application, $baseCv);
    }

    /**
     * The stored report without its hashes, plus whether it still describes
     * the application's current job and the CV it was taken from. Null when
     * the application has never been checked.
     *
     * @return array<string, mixed>|null
     */
    public static function present(Application $application, ?string $baseCv): ?array
    {
        $report = $application->ats_report;

        if (! is_array($report)) {
            return null;
        }

        $cv = self::cvFor($application, (string) ($report['source'] ?? 'base'), $baseCv);

        $stale = ($report['jdHash'] ?? null) !== self::jobHash($application)
            || ($report['cvHash'] ?? null) !== self::hash($cv);

        return Arr::except($report, ['jdHash', 'cvHash']) + ['stale' => $stale];
    }

    /**
     * Keep only well-formed keywords: a string term of sensible length, once
     * each ignoring case, a known kind (else 'skill'), `required` only when
     * it is literally true, and a few distinct string aliases.
     *
     * @return list<array{term: string, aliases: list<string>, kind: string, required: bool}>
     */
    public static function sanitise(mixed $raw): array
    {
        if (! is_array($raw)) {
            return [];
        }

        $keywords = [];
        $seen = [];

        foreach ($raw as $item) {
            if (! is_array($item) || ! is_string($item['term'] ?? null)) {
                continue;
            }

            $term = self::clean($item['term']);
            $key = mb_strtolower($term);

            if ($term === '' || mb_strlen($term) > self::MAX_TERM_LENGTH || isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $keywords[] = [
                'term' => $term,
                'aliases' => self::aliases($item['aliases'] ?? null, $term),
                'kind' => in_array($item['kind'] ?? null, AtsPrompts::KINDS, true) ? $item['kind'] : 'skill',
                'required' => ($item['required'] ?? null) === true,
            ];

            if (count($keywords) === self::MAX_KEYWORDS) {
                break;
            }
        }

        return $keywords;
    }

    /**
     * @return list<array{term: string, aliases: list<string>, kind: string, required: bool}>
     *
     * @throws GeminiException
     * @throws ValidationException
     */
    private function keywords(Application $application, string $jobHash, ?Closure $beforeAskingModel): array
    {
        $cached = $application->ats_keywords;

        if (is_array($cached) && ($cached['hash'] ?? null) === $jobHash && is_array($cached['keywords'] ?? null)) {
            return $cached['keywords'];
        }

        if ($beforeAskingModel !== null) {
            $beforeAskingModel();
        }

        $answer = $this->gemini->generateJson(
            AtsPrompts::keywords($application->role, trim((string) $application->job_description)),
            AtsPrompts::keywordsSchema(),
        );

        $keywords = self::sanitise($answer['keywords'] ?? null);

        if ($keywords === []) {
            throw ValidationException::withMessages([
                'jobDescription' => 'No skills or qualifications could be read from this job description. Is it the full posting?',
            ]);
        }

        return $keywords;
    }

    /** @return list<string> */
    private static function aliases(mixed $raw, string $term): array
    {
        if (! is_array($raw)) {
            return [];
        }

        $aliases = [];
        $seen = [mb_strtolower($term) => true];

        foreach ($raw as $alias) {
            if (! is_string($alias)) {
                continue;
            }

            $alias = self::clean($alias);
            $key = mb_strtolower($alias);

            if ($alias === '' || mb_strlen($alias) > self::MAX_TERM_LENGTH || isset($seen[$key])) {
                continue;
            }

            $seen[$key] = true;
            $aliases[] = $alias;

            if (count($aliases) === self::MAX_ALIASES) {
                break;
            }
        }

        return $aliases;
    }

    private static function cvFor(Application $application, string $source, ?string $baseCv): string
    {
        return (string) ($source === 'tailored' ? $application->tailored_cv : $baseCv);
    }

    /** The keywords depend on both: the prompt names the role. */
    private static function jobHash(Application $application): string
    {
        return self::hash($application->role."\0".$application->job_description);
    }

    private static function hash(string $text): string
    {
        return sha1(trim($text));
    }

    private static function clean(string $text): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', $text));
    }
}
