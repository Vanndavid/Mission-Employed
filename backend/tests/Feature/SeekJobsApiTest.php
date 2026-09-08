<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Seek\SeekJobSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SeekJobsApiTest extends TestCase
{
    use RefreshDatabase;

    private const SEARCH_URL = 'https://www.seek.com.au/api/jobsearch/v5/search';

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
    }

    /** @return array<array-key, mixed> */
    private function fixture(): array
    {
        return json_decode(
            file_get_contents(base_path('tests/fixtures/seek-search.json')),
            true,
            512,
            JSON_THROW_ON_ERROR,
        );
    }

    public function test_the_seek_search_requires_a_token(): void
    {
        $this->getJson('/api/seek/jobs')->assertUnauthorized();
    }

    public function test_it_maps_seek_listings_into_the_tracker_shape(): void
    {
        Http::fake([self::SEARCH_URL.'*' => Http::response($this->fixture())]);

        Sanctum::actingAs(User::factory()->create());

        $response = $this->getJson('/api/seek/jobs?keywords=software+engineer&where=All+Australia')
            ->assertOk()
            ->assertJsonMissingPath('data');

        $response->assertJsonPath('totalCount', 1572);
        $response->assertJsonPath('page', 1);
        $response->assertJsonPath('pageSize', 20);
        $response->assertJsonPath('keywords', 'software engineer');
        $response->assertJsonPath('where', 'All Australia');
        $response->assertJsonCount(2, 'jobs');

        $response->assertJsonPath('jobs.0.id', '94488368');
        $response->assertJsonPath('jobs.0.title', 'Software Engineer');
        $response->assertJsonPath('jobs.0.company', 'Energetica');
        $response->assertJsonPath('jobs.0.location', 'Melbourne VIC');
        $response->assertJsonPath('jobs.0.url', 'https://www.seek.com.au/job/94488368');
        $response->assertJsonPath('jobs.0.salary', '$105,000 – $135,000 per year');
        $response->assertJsonPath('jobs.0.teaser', 'End-to-end software platform in energy and sustainability.');
        $response->assertJsonPath('jobs.0.workArrangement', 'Hybrid');
        $response->assertJsonPath('jobs.0.listedAgo', '7h ago');
        $response->assertJsonPath('jobs.0.classification', 'Information & Communication Technology');
        $response->assertJsonPath('jobs.0.subclassification', 'Engineering - Software');
        $this->assertSame(['career development', 'rapidly growing startup'], $response->json('jobs.0.bulletPoints'));
        $this->assertSame(['Full time'], $response->json('jobs.0.workTypes'));

        $response->assertJsonPath('jobs.1.company', 'Northwind Systems');
        $response->assertJsonPath('jobs.1.location', 'Sydney NSW, Remote');

        Http::assertSent(function (Request $request): bool {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

            return str_starts_with($request->url(), self::SEARCH_URL)
                && ($query['siteKey'] ?? null) === 'AU-Main'
                && ($query['sourcesystem'] ?? null) === SeekJobSearch::DEFAULT_SOURCE_SYSTEM
                && ($query['keywords'] ?? null) === 'software engineer'
                && ($query['where'] ?? null) === 'All Australia'
                && ($query['page'] ?? null) === '1'
                && ($query['pageSize'] ?? null) === '20'
                && ($query['sortmode'] ?? null) === SeekJobSearch::SORT_LISTED_DATE
                && $request->header('User-Agent')[0] === SeekJobSearch::USER_AGENT;
        });
    }

    public function test_it_defaults_keywords_and_location_when_the_query_is_empty(): void
    {
        Http::fake([self::SEARCH_URL.'*' => Http::response(['data' => [], 'totalCount' => 0])]);

        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/seek/jobs')
            ->assertOk()
            ->assertJsonPath('keywords', SeekJobSearch::DEFAULT_KEYWORDS)
            ->assertJsonPath('where', SeekJobSearch::DEFAULT_WHERE)
            ->assertJsonPath('jobs', []);
    }

    public function test_it_rejects_an_out_of_range_page(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $this->getJson('/api/seek/jobs?page=0')->assertUnprocessable();
        $this->getJson('/api/seek/jobs?pageSize=99')->assertUnprocessable();
    }

    public function test_a_seek_failure_is_a_contained_502(): void
    {
        Http::fake([self::SEARCH_URL.'*' => Http::response(
            '<html>cloudflare challenge secret-upstream-body</html>',
            403,
        )]);

        Sanctum::actingAs(User::factory()->create());

        $response = $this->getJson('/api/seek/jobs')->assertStatus(502);

        $response->assertJsonPath('code', 'seek_unavailable');
        $response->assertJsonPath('message', 'Seek is unavailable right now. Please try again in a moment.');
        $this->assertStringNotContainsString('secret-upstream-body', $response->getContent());
        $this->assertStringNotContainsString('cloudflare', $response->getContent());
    }

    public function test_malformed_seek_json_is_a_contained_502(): void
    {
        Http::fake([self::SEARCH_URL.'*' => Http::response('not-json', 200)]);

        Sanctum::actingAs(User::factory()->create());

        $response = $this->getJson('/api/seek/jobs')->assertStatus(502);

        $response->assertJsonPath('code', 'seek_unavailable');
        $this->assertStringNotContainsString('not-json', $response->getContent());
    }
}
