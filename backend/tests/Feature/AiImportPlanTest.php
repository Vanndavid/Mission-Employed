<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\FakeGeminiService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * The spreadsheet column-mapping endpoint.
 *
 * The fixture headers are a real sheet's, so the prompt assertions double as a
 * record of what the model is actually asked to solve.
 */
class AiImportPlanTest extends TestCase
{
    use RefreshDatabase;

    /** @var list<string> */
    private const HEADERS = [
        '#', 'Date Applied', 'Company', 'Role', 'Channel',
        'Status', 'Status Date', 'Days Since Applied', 'Follow Up?', 'Notes',
    ];

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
        Sanctum::actingAs(User::factory()->premium()->create());
    }

    public function test_it_maps_a_spreadsheet_onto_tracker_fields(): void
    {
        $gemini = FakeGeminiService::swap()->queueJson([
            'columns' => [
                'company' => 2,
                'role' => 3,
                'location' => -1,
                'url' => -1,
                'source' => 4,
                'status' => 5,
                'dateApplied' => 1,
                'statusDate' => 6,
                'notes' => 9,
                'nextAction' => 8,
            ],
            'statusMap' => [
                ['from' => 'Applied', 'status' => 'Applied', 'nextAction' => '', 'noteSuffix' => ''],
                ['from' => 'Rejected', 'status' => 'Rejected', 'nextAction' => '', 'noteSuffix' => ''],
                ['from' => 'Employer replied - check', 'status' => 'Applied', 'nextAction' => 'Check employer reply', 'noteSuffix' => ''],
                ['from' => 'Role filled', 'status' => 'Rejected', 'nextAction' => '', 'noteSuffix' => 'Role filled'],
            ],
            'sourceMap' => [
                ['from' => 'Company site', 'source' => 'Company site'],
                ['from' => 'LinkedIn', 'source' => 'LinkedIn'],
            ],
            'dateFormatHint' => 'D MMM YYYY',
            'notes' => 'Column 7 counts elapsed days, not a date.',
        ]);

        $response = $this->postJson('/api/ai/import/plan', [
            'headers' => self::HEADERS,
            'sampleRows' => [
                ['1', '21 Sep 2026', 'Open Universities Australia', 'Software Engineer', 'Company site', 'Applied', '', '1', '', '12-month max term contract'],
                ['4', '20 Sep 2026', 'Cullen Jewellery', 'Software Engineer', 'Company site', 'Rejected', '22 Sep 2026', '2', '', ''],
            ],
            'columnValues' => [
                5 => ['Applied', 'Rejected', 'Employer replied - check', 'Role filled'],
                4 => ['Company site', 'LinkedIn'],
            ],
        ]);

        $response->assertOk()
            ->assertJsonPath('columns.company', 2)
            ->assertJsonPath('columns.role', 3)
            ->assertJsonPath('columns.source', 4)
            ->assertJsonPath('columns.dateApplied', 1)
            ->assertJsonPath('columns.statusDate', 6)
            ->assertJsonPath('columns.nextAction', 8)
            // Nothing in this sheet is a location or a URL.
            ->assertJsonPath('columns.location', -1)
            ->assertJsonPath('columns.url', -1)
            ->assertJsonCount(4, 'statusMap')
            ->assertJsonPath('statusMap.2.nextAction', 'Check employer reply')
            ->assertJsonPath('statusMap.3.noteSuffix', 'Role filled')
            ->assertJsonCount(2, 'sourceMap')
            ->assertJsonPath('dateFormatHint', 'D MMM YYYY');

        $gemini->assertCallCount('generateJson', 1)
            // Headers go over as indices, so a blank or duplicated header
            // cannot break the join.
            ->assertPromptContains('1: Date Applied')
            ->assertPromptContains('7: Days Since Applied')
            ->assertPromptContains('Cullen Jewellery')
            ->assertPromptContains('column 5: "Applied", "Rejected"')
            // The five statuses the sheet has to be folded into.
            ->assertPromptContains('Saved, Applied, Interviewing, Offer, Rejected');

        $schema = $gemini->lastCall('generateJson')['responseSchema'];

        $this->assertSame('OBJECT', $schema['type']);
        $this->assertSame(
            ['company', 'role', 'location', 'url', 'source', 'status', 'dateApplied', 'statusDate', 'notes', 'nextAction'],
            array_keys($schema['properties']['columns']['properties']),
        );
        $this->assertSame(['company', 'role'], $schema['properties']['columns']['required']);
        $this->assertSame('ARRAY', $schema['properties']['statusMap']['type']);
    }

    public function test_it_clamps_a_column_index_outside_the_header_row(): void
    {
        FakeGeminiService::swap()->queueJson([
            'columns' => [
                'company' => 0,
                'role' => 1,
                // Past the end, negative beyond the sentinel, and prose.
                'location' => 99,
                'url' => -7,
                'source' => 'the channel column',
                'notes' => null,
            ],
            'statusMap' => [],
        ]);

        $this->postJson('/api/ai/import/plan', [
            'headers' => ['Company', 'Role'],
            'sampleRows' => [['Acme', 'Engineer']],
        ])
            ->assertOk()
            ->assertJsonPath('columns.company', 0)
            ->assertJsonPath('columns.role', 1)
            ->assertJsonPath('columns.location', -1)
            ->assertJsonPath('columns.url', -1)
            ->assertJsonPath('columns.source', -1)
            // A field the model left out entirely still comes back, as absent.
            ->assertJsonPath('columns.statusDate', -1);
    }

    public function test_it_reads_a_numeric_string_index(): void
    {
        FakeGeminiService::swap()->queueJson([
            'columns' => ['company' => '0', 'role' => '1'],
            'statusMap' => [],
        ]);

        $this->postJson('/api/ai/import/plan', [
            'headers' => ['Company', 'Role'],
            'sampleRows' => [['Acme', 'Engineer']],
        ])
            ->assertOk()
            ->assertJsonPath('columns.company', 0)
            ->assertJsonPath('columns.role', 1);
    }

    public function test_it_drops_a_status_mapping_that_is_not_one_of_ours(): void
    {
        FakeGeminiService::swap()->queueJson([
            'columns' => ['company' => 0, 'role' => 1],
            'statusMap' => [
                ['from' => 'Applied', 'status' => 'Applied'],
                // Invented wholesale, and a blank key.
                ['from' => 'Ghosted', 'status' => 'Ghosted'],
                ['from' => '', 'status' => 'Applied'],
                'not an object',
            ],
        ]);

        $this->postJson('/api/ai/import/plan', [
            'headers' => ['Company', 'Role'],
            'sampleRows' => [['Acme', 'Engineer']],
        ])
            ->assertOk()
            ->assertJsonCount(1, 'statusMap')
            ->assertJsonPath('statusMap.0.from', 'Applied')
            // Absent optional keys are filled in as blank, so the client can
            // read them without guarding every access.
            ->assertJsonPath('statusMap.0.nextAction', '')
            ->assertJsonPath('statusMap.0.noteSuffix', '');
    }

    public function test_it_keeps_the_first_of_a_repeated_status_mapping(): void
    {
        FakeGeminiService::swap()->queueJson([
            'columns' => ['company' => 0, 'role' => 1],
            'statusMap' => [
                ['from' => 'Rejected', 'status' => 'Rejected', 'noteSuffix' => 'first'],
                // Same wording, different casing — one rule, not two.
                ['from' => 'rejected', 'status' => 'Applied', 'noteSuffix' => 'second'],
            ],
            'sourceMap' => [
                ['from' => 'Seek', 'source' => 'Seek'],
                ['from' => 'seek', 'source' => 'Seek Australia'],
                ['from' => 'LinkedIn', 'source' => ''],
            ],
        ]);

        $this->postJson('/api/ai/import/plan', [
            'headers' => ['Company', 'Role'],
            'sampleRows' => [['Acme', 'Engineer']],
        ])
            ->assertOk()
            ->assertJsonCount(1, 'statusMap')
            ->assertJsonPath('statusMap.0.noteSuffix', 'first')
            ->assertJsonCount(1, 'sourceMap')
            ->assertJsonPath('sourceMap.0.source', 'Seek');
    }

    public function test_it_truncates_a_next_action_to_the_column_width(): void
    {
        FakeGeminiService::swap()->queueJson([
            'columns' => ['company' => 0, 'role' => 1],
            'statusMap' => [
                ['from' => 'Applied', 'status' => 'Applied', 'nextAction' => str_repeat('x', 400)],
            ],
        ]);

        $response = $this->postJson('/api/ai/import/plan', [
            'headers' => ['Company', 'Role'],
            'sampleRows' => [['Acme', 'Engineer']],
        ])->assertOk();

        // next_action is a string(255); a longer one would 422 on import.
        $this->assertSame(255, mb_strlen($response->json('statusMap.0.nextAction')));
    }

    public function test_it_requires_headers_and_rows(): void
    {
        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/import/plan', ['headers' => [], 'sampleRows' => []])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['headers']);

        $this->postJson('/api/ai/import/plan', ['headers' => ['Company']])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['sampleRows']);

        $gemini->assertNothingSent();
    }

    public function test_it_caps_the_sample_at_eight_rows(): void
    {
        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/import/plan', [
            'headers' => ['Company'],
            'sampleRows' => array_fill(0, 9, ['Acme']),
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['sampleRows']);

        $gemini->assertNothingSent();
    }

    public function test_it_contains_an_upstream_failure(): void
    {
        FakeGeminiService::swap()->throwOn('generateJson');

        $response = $this->postJson('/api/ai/import/plan', [
            'headers' => ['Company', 'Role'],
            'sampleRows' => [['Acme', 'Engineer']],
        ])
            ->assertStatus(502)
            ->assertJsonPath('code', 'ai_unavailable');

        // Whatever the upstream said stays in the log.
        $this->assertStringNotContainsString('503', $response->json('message'));
    }

    public function test_a_free_user_cannot_map_a_spreadsheet(): void
    {
        Sanctum::actingAs(User::factory()->create());

        $gemini = FakeGeminiService::swap();

        $this->postJson('/api/ai/import/plan', [
            'headers' => ['Company', 'Role'],
            'sampleRows' => [['Acme', 'Engineer']],
        ])
            ->assertForbidden()
            ->assertJsonPath('code', 'premium_required');

        $gemini->assertNothingSent();
    }

    public function test_it_requires_a_token(): void
    {
        $gemini = FakeGeminiService::swap();

        // setUp binds an acting user; drop the resolved guards so this request
        // falls back to the bearer token it is actually sent with.
        Auth::forgetGuards();

        $this->postJson('/api/ai/import/plan', [
            'headers' => ['Company'],
            'sampleRows' => [['Acme']],
        ], ['Authorization' => 'Bearer not-a-token'])
            ->assertUnauthorized();

        $gemini->assertNothingSent();
    }
}
