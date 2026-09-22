<?php

namespace App\Services\Seek;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Client for Seek's public jobsearch JSON.
 *
 * The listing page hits GET /api/jobsearch/v5/search with `siteKey=AU-Main`
 * and `sourcesystem=houston`. There is no official job-seeker SDK, so this
 * speaks that endpoint over Illuminate's HTTP client and maps each listing
 * into the small shape the tracker UI needs.
 *
 * It is a pure transport: no persistence, no session. Tests bind nothing —
 * they Http::fake() this URL the way GeminiServiceTest fakes Gemini.
 */
class SeekJobSearch
{
    public const DEFAULT_BASE_URL = 'https://www.seek.com.au';

    public const DEFAULT_SITE_KEY = 'AU-Main';

    public const DEFAULT_SOURCE_SYSTEM = 'houston';

    public const DEFAULT_KEYWORDS = 'software engineer';

    public const DEFAULT_WHERE = 'All Australia';

    public const DEFAULT_PAGE = 1;

    public const DEFAULT_PAGE_SIZE = 20;

    public const MAX_PAGE_SIZE = 50;

    public const SORT_LISTED_DATE = 'ListedDate';

    public const SORT_RELEVANCE = 'KeywordRelevance';

    /** Statuses worth a second attempt. A 403 is Cloudflare, not transient. */
    private const RETRYABLE_STATUSES = [408, 429, 500, 502, 503, 504];

    /**
     * Chrome-like UA. Seek sits behind Cloudflare, and Guzzle's default
     * user-agent is enough to get a challenge page instead of JSON.
     */
    public const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

    /**
     * Search Seek and return the tracker-shaped payload.
     *
     * @return array{jobs: list<array<string, mixed>>, totalCount: int, page: int, pageSize: int, keywords: string, where: string}
     */
    public function search(
        string $keywords = self::DEFAULT_KEYWORDS,
        string $where = self::DEFAULT_WHERE,
        int $page = self::DEFAULT_PAGE,
        int $pageSize = self::DEFAULT_PAGE_SIZE,
        string $sort = self::SORT_LISTED_DATE,
    ): array {
        $keywords = trim($keywords) !== '' ? trim($keywords) : self::DEFAULT_KEYWORDS;
        $where = trim($where) !== '' ? trim($where) : self::DEFAULT_WHERE;
        $page = max(1, $page);
        $pageSize = min(self::MAX_PAGE_SIZE, max(1, $pageSize));
        $sort = $sort === self::SORT_RELEVANCE ? self::SORT_RELEVANCE : self::SORT_LISTED_DATE;

        $payload = $this->fetch($keywords, $where, $page, $pageSize, $sort);

        $jobs = [];
        foreach ($payload['data'] ?? [] as $listing) {
            if (! is_array($listing)) {
                continue;
            }
            $mapped = $this->mapJob($listing);
            if ($mapped !== null) {
                $jobs[] = $mapped;
            }
        }

        return [
            'jobs' => $jobs,
            'totalCount' => (int) ($payload['totalCount'] ?? 0),
            'page' => $page,
            'pageSize' => $pageSize,
            'keywords' => $keywords,
            'where' => $where,
        ];
    }

    /**
     * @return array<array-key, mixed>
     */
    private function fetch(string $keywords, string $where, int $page, int $pageSize, string $sort): array
    {
        $url = rtrim($this->baseUrl(), '/').'/api/jobsearch/v5/search';

        try {
            $response = Http::withHeaders([
                'Accept' => 'application/json',
                'Accept-Language' => 'en-AU,en;q=0.9',
                'User-Agent' => self::USER_AGENT,
            ])
                ->timeout($this->configInt('timeout', 15))
                ->connectTimeout($this->configInt('connect_timeout', 5))
                ->retry(
                    max(1, $this->configInt('retries', 2)),
                    max(0, $this->configInt('retry_delay', 300)),
                    fn (Throwable $exception) => $this->shouldRetry($exception),
                    throw: false,
                )
                ->get($url, [
                    'siteKey' => $this->siteKey(),
                    'sourcesystem' => self::DEFAULT_SOURCE_SYSTEM,
                    'keywords' => $keywords,
                    'where' => $where,
                    'page' => $page,
                    'pageSize' => $pageSize,
                    'sortmode' => $sort,
                ]);
        } catch (ConnectionException $exception) {
            throw SeekException::transportFailure($exception->getMessage());
        }

        if ($response->failed()) {
            throw SeekException::fromStatus($response->status(), $response->body());
        }

        $decoded = $response->json();

        if (! is_array($decoded)) {
            throw SeekException::malformedJson($response->body());
        }

        return $decoded;
    }

    /**
     * @param  array<array-key, mixed>  $job
     * @return array<string, mixed>|null
     */
    private function mapJob(array $job): ?array
    {
        $id = $this->text($job['id'] ?? null);
        $title = $this->text($job['title'] ?? null);

        if ($id === '' || $title === '') {
            return null;
        }

        $company = $this->company($job);
        if ($company === '') {
            $company = 'Unknown company';
        }

        return [
            'id' => $id,
            'title' => $title,
            'company' => $company,
            'location' => $this->location($job),
            'url' => $this->jobUrl($id),
            'salary' => $this->text($job['salaryLabel'] ?? null),
            'teaser' => $this->text($job['teaser'] ?? null),
            'bulletPoints' => $this->strings($job['bulletPoints'] ?? null),
            'workTypes' => $this->strings($job['workTypes'] ?? null),
            'workArrangement' => $this->workArrangement($job),
            'listedAt' => $this->text($job['listingDate'] ?? null),
            'listedAgo' => $this->text($job['listingDateDisplay'] ?? null),
            'classification' => $this->classification($job, 'classification'),
            'subclassification' => $this->classification($job, 'subclassification'),
        ];
    }

    public function jobUrl(string $id): string
    {
        return rtrim($this->baseUrl(), '/').'/job/'.$id;
    }

    /**
     * @param  array<array-key, mixed>  $job
     */
    private function company(array $job): string
    {
        $fromName = $this->text($job['companyName'] ?? null);
        if ($fromName !== '') {
            return $fromName;
        }

        $advertiser = is_array($job['advertiser'] ?? null) ? $job['advertiser'] : [];
        $fromAdvertiser = $this->text($advertiser['description'] ?? null);
        if ($fromAdvertiser !== '') {
            return $fromAdvertiser;
        }

        $employer = is_array($job['employer'] ?? null) ? $job['employer'] : [];

        return $this->text($employer['name'] ?? null);
    }

    /**
     * @param  array<array-key, mixed>  $job
     */
    private function location(array $job): string
    {
        $locations = $job['locations'] ?? null;
        if (! is_array($locations)) {
            return '';
        }

        $labels = [];
        foreach ($locations as $location) {
            if (! is_array($location)) {
                continue;
            }
            $label = $this->text($location['label'] ?? null);
            if ($label !== '') {
                $labels[] = $label;
            }
        }

        return implode(', ', $labels);
    }

    /**
     * @param  array<array-key, mixed>  $job
     */
    private function workArrangement(array $job): string
    {
        $arrangements = is_array($job['workArrangements'] ?? null) ? $job['workArrangements'] : [];
        $display = $this->text($arrangements['displayText'] ?? null);
        if ($display !== '') {
            return $display;
        }

        $rows = $arrangements['data'] ?? null;
        if (! is_array($rows)) {
            return '';
        }

        $labels = [];
        foreach ($rows as $row) {
            if (! is_array($row)) {
                continue;
            }
            $label = is_array($row['label'] ?? null) ? $row['label'] : [];
            $text = $this->text($label['text'] ?? null);
            if ($text !== '') {
                $labels[] = $text;
            }
        }

        return implode(', ', $labels);
    }

    /**
     * @param  array<array-key, mixed>  $job
     */
    private function classification(array $job, string $key): string
    {
        $rows = $job['classifications'] ?? null;
        if (! is_array($rows) || $rows === []) {
            return '';
        }

        $first = $rows[0] ?? null;
        if (! is_array($first)) {
            return '';
        }

        $node = is_array($first[$key] ?? null) ? $first[$key] : [];

        return $this->text($node['description'] ?? null);
    }

    private function text(mixed $value): string
    {
        return is_scalar($value) ? trim((string) $value) : '';
    }

    /**
     * @return list<string>
     */
    private function strings(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter(
            array_map(fn ($item) => $this->text($item), $value),
            static fn (string $item) => $item !== '',
        ));
    }

    private function shouldRetry(Throwable $exception): bool
    {
        if ($exception instanceof ConnectionException) {
            return true;
        }

        if ($exception instanceof RequestException && $exception->response !== null) {
            return in_array($exception->response->status(), self::RETRYABLE_STATUSES, true);
        }

        return false;
    }

    private function baseUrl(): string
    {
        $url = config('services.seek.base_url', self::DEFAULT_BASE_URL);

        return is_string($url) && $url !== '' ? $url : self::DEFAULT_BASE_URL;
    }

    private function siteKey(): string
    {
        $key = config('services.seek.site_key', self::DEFAULT_SITE_KEY);

        return is_string($key) && $key !== '' ? $key : self::DEFAULT_SITE_KEY;
    }

    private function configInt(string $key, int $default): int
    {
        $value = config('services.seek.'.$key, $default);

        return is_numeric($value) ? (int) $value : $default;
    }
}
