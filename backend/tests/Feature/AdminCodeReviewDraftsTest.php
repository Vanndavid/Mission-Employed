<?php

namespace Tests\Feature;

use App\Enums\PracticeKind;
use App\Enums\PracticeLanguage;
use App\Enums\PracticeQuestionSource;
use App\Enums\PracticeQuestionStatus;
use App\Models\PracticeQuestion;
use App\Models\User;
use App\Services\FakeGeminiService;
use App\Services\Practice\CodeReviewItemValidator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * AI drafts of code review snippets for the question bank, and the admin's
 * edits to them. Every draft and every save passes CodeReviewItemValidator,
 * the seed files' rules. A planted issue's lines decide which comments count
 * as candidates for it, so its range is checked against the code as the
 * viewer numbers it, and against the lines the model quoted.
 */
class AdminCodeReviewDraftsTest extends TestCase
{
    use RefreshDatabase;

    private const REQUEST = [
        'kind' => 'code_review',
        'language' => 'javascript',
        'difficulty' => 'medium',
        'count' => 5,
    ];

    /** 25 lines, as the model sends them: one string per line. */
    private const CODE = [
        "const express = require('express');",
        "const db = require('./db');",
        '',
        'const router = express.Router();',
        'const PAGE_SIZE = 20;',
        '',
        "router.get('/orders', async (req, res) => {",
        '  const page = parseInt(req.query.page, 10) || 1;',
        '  const status = req.query.status;',
        "  let sql = 'SELECT * FROM orders WHERE user_id = ?';",
        '  if (status) {',
        "    sql += ` AND status = '\${status}'`;",
        '  }',
        '  sql += ` LIMIT ${PAGE_SIZE} OFFSET ${page * PAGE_SIZE}`;',
        '  const orders = await db.query(sql, [req.user.id]);',
        '  for (const order of orders) {',
        '    order.items = await db.query(',
        "      'SELECT * FROM order_items WHERE order_id = ?',",
        '      [order.id]',
        '    );',
        '  }',
        '  res.json({ page, orders });',
        '});',
        '',
        'module.exports = router;',
    ];

    /** One planted issue as the model writes it, quoting its first and last lines. */
    private static function issue(string $id, int $start, int $end, array $overrides = []): array
    {
        return [
            'id' => $id,
            'lines' => [$start, $end],
            'firstLine' => self::CODE[$start - 1] ?? '',
            'lastLine' => self::CODE[$end - 1] ?? '',
            'category' => 'bug',
            'severity' => 2,
            'summary' => "What is wrong with {$id}.",
            'fix' => "How to fix {$id}.",
            ...$overrides,
        ];
    }

    /** One model item, well formed for the request above unless overridden. */
    private static function item(array $overrides = []): array
    {
        return [
            'language' => 'javascript',
            'title' => 'One page of orders',
            'prompt' => 'An Express route that returns one page of the signed-in user\'s orders.',
            'code' => self::CODE,
            'issues' => [
                self::issue('sql-injection', 11, 13, ['category' => 'security', 'severity' => 3]),
                self::issue('offset-skips-first-page', 14, 14),
            ],
            'explanation' => 'Read every value that reaches a query string first.',
            ...$overrides,
        ];
    }

    private function generate(array $items, array $request = []): TestResponse
    {
        FakeGeminiService::swap()->queueJson(['questions' => $items]);

        return $this->postJson('/api/admin/practice/questions/generate', [...self::REQUEST, ...$request]);
    }

    /** The reasons item $index was refused, as one string. */
    private static function reasons(TestResponse $response, int $index): string
    {
        $rejected = collect($response->json('rejected'))->firstWhere('index', $index);

        return implode(' ', $rejected['reasons'] ?? ['(not rejected)']);
    }

    public function test_only_the_valid_snippets_become_drafts_and_the_broken_ones_come_back_with_reasons(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $response = $this->generate([
            self::item(),
            self::item(['prompt' => 'Past the end', 'issues' => [self::issue('a', 11, 13), self::issue('b', 25, 27)]]),
            self::item(['prompt' => 'One issue', 'issues' => [self::issue('a', 11, 13)]]),
            self::item(['prompt' => 'Blank start', 'issues' => [self::issue('a', 11, 13), self::issue('b', 3, 4)]]),
            self::item(['prompt' => 'No fix', 'issues' => [self::issue('a', 11, 13), self::issue('b', 14, 14, ['fix' => ' '])]]),
        ])->assertOk();

        $response->assertJsonCount(1, 'drafts');
        $response->assertJsonPath('drafts.0.kind', 'code_review');
        $response->assertJsonPath('drafts.0.status', 'draft');
        $response->assertJsonPath('drafts.0.source', 'ai');
        $response->assertJsonPath('drafts.0.topic', 'One page of orders');
        $response->assertJsonPath('drafts.0.options', null);
        $response->assertJsonPath('drafts.0.reviewNotes', null);

        $this->assertSame([2, 3, 4, 5], array_column($response->json('rejected'), 'index'));
        $this->assertStringContainsString("inside the snippet's 25 lines", self::reasons($response, 2));
        $this->assertStringContainsString('2 to 6 issues', self::reasons($response, 3));
        $this->assertStringContainsString('blank', self::reasons($response, 4));
        $this->assertStringContainsString('needs a fix', self::reasons($response, 5));

        $draft = PracticeQuestion::sole();
        $this->assertSame(PracticeKind::CodeReview, $draft->kind);
        $this->assertSame(PracticeLanguage::JavaScript, $draft->language);
        // The difficulty is the request's; the model is not asked for it.
        $this->assertSame('medium', $draft->difficulty);
        $this->assertSame(PracticeQuestionStatus::Draft, $draft->status);
        $this->assertSame(PracticeQuestionSource::Ai, $draft->source);
        $this->assertSame(implode("\n", self::CODE), $draft->code);
        $this->assertSame('Read every value that reaches a query string first.', $draft->explanation);
        // The key is exactly what the seed files store: the quotes were only for checking.
        $this->assertSame((new CodeReviewItemValidator)->answer([...self::item(), 'code' => $draft->code]), $draft->answer);
        $this->assertSame(
            ['id', 'lines', 'category', 'severity', 'summary', 'fix'],
            array_keys($draft->answer['issues'][0]),
        );
    }

    public function test_a_range_that_does_not_point_at_the_lines_the_model_quoted_is_dropped(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $offByOne = self::issue('offset-skips-first-page', 14, 14);
        $offByOne['lines'] = [15, 15];
        $wrongEnd = self::issue('n-plus-one', 16, 21);
        $wrongEnd['lines'] = [16, 20];

        $response = $this->generate([
            self::item(['prompt' => 'Off by one', 'issues' => [self::issue('sql-injection', 11, 13), $offByOne]]),
            self::item(['prompt' => 'Wrong end', 'issues' => [self::issue('sql-injection', 11, 13), $wrongEnd]]),
            self::item(['prompt' => 'No quote', 'issues' => [self::issue('sql-injection', 11, 13), self::issue('b', 14, 14, ['firstLine' => null])]]),
        ], ['count' => 3])->assertOk();

        $response->assertJsonCount(0, 'drafts');
        $this->assertStringContainsString('offset-skips-first-page', self::reasons($response, 1));
        $this->assertStringContainsString('line 15', self::reasons($response, 1));
        $this->assertStringContainsString('line 20', self::reasons($response, 2));
        $this->assertStringContainsString('quote', self::reasons($response, 3));
        $this->assertSame(0, PracticeQuestion::count());
    }

    public function test_the_models_types_are_normalised_and_a_markdown_fence_is_stripped(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $code = "```javascript\r\n".implode("  \r\n", self::CODE)."\r\n```\r\n\r\n";
        $issue = self::issue('sql-injection', 11, 13, [
            'lines' => ['11', 13.0],
            'severity' => '3',
            'category' => ' Security ',
            'firstLine' => '   if (status)   {',
            'summary' => '  The status is pasted into the SQL.  ',
        ]);

        $this->generate([
            self::item(['code' => $code, 'title' => '  One page of orders ', 'issues' => [$issue, self::issue('offset-skips-first-page', 14, 14)]]),
        ], ['count' => 1])->assertOk()->assertJsonCount(1, 'drafts');

        $draft = PracticeQuestion::sole();
        $this->assertSame(implode("\n", self::CODE), $draft->code);
        $this->assertSame('One page of orders', $draft->topic);
        $this->assertSame(
            ['id' => 'sql-injection', 'lines' => [11, 13], 'category' => 'security', 'severity' => 3, 'summary' => 'The status is pasted into the SQL.', 'fix' => 'How to fix sql-injection.'],
            $draft->answer['issues'][0],
        );
    }

    public function test_ranges_are_checked_against_the_lines_the_viewer_numbers(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        // A trailing newline is not a line of its own, in the viewer or here.
        $code = implode("\n", self::CODE)."\n";
        $lastLine = self::issue('export', 25, 25);
        $pastIt = self::issue('past-the-end', 26, 26, ['firstLine' => '', 'lastLine' => '']);
        // A model that counted the fence as line 1 is one line out everywhere.
        $fenced = ['```javascript', ...self::CODE, '```'];
        $countedTheFence = self::issue('offset-skips-first-page', 14, 14);
        $countedTheFence['lines'] = [15, 15];

        $response = $this->generate([
            self::item(['code' => $code, 'issues' => [self::issue('sql-injection', 11, 13), $lastLine]]),
            self::item(['prompt' => 'Past it', 'code' => $code, 'issues' => [self::issue('sql-injection', 11, 13), $pastIt]]),
            self::item(['prompt' => 'Fenced', 'code' => $fenced, 'issues' => [self::issue('sql-injection', 11, 13, ['lines' => [12, 14]]), $countedTheFence]]),
        ], ['count' => 3])->assertOk();

        $response->assertJsonCount(1, 'drafts');
        $this->assertStringContainsString("inside the snippet's 25 lines", self::reasons($response, 2));
        $this->assertStringContainsString('line 12', self::reasons($response, 3));

        $draft = PracticeQuestion::sole();
        $this->assertSame(25, CodeReviewItemValidator::lineCount($draft->code));
        $this->assertSame([25, 25], $draft->answer['issues'][1]['lines']);
    }

    public function test_a_snippet_in_another_language_is_dropped(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());

        $response = $this->generate([self::item(['language' => 'python'])], ['count' => 1])->assertOk();

        $response->assertJsonCount(0, 'drafts');
        $this->assertStringContainsString('javascript', self::reasons($response, 1));
    }

    public function test_it_asks_once_with_a_schema_naming_the_language_and_the_snippets_already_in_the_bank(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        PracticeQuestion::factory()->codeReview()->create(['prompt' => 'Debounce a search box.']);
        PracticeQuestion::factory()->codeReview()->create(['prompt' => 'A Python CSV importer.', 'language' => PracticeLanguage::Python]);
        PracticeQuestion::factory()->create(['prompt' => 'A JavaScript quiz question.']);

        $gemini = FakeGeminiService::swap()->queueJson(['questions' => [self::item()]]);
        $this->postJson('/api/admin/practice/questions/generate', [...self::REQUEST, 'count' => 2])->assertOk();

        $gemini->assertCallCount('generateJson', 1);
        $call = $gemini->lastCall('generateJson');
        $this->assertStringContainsString('JavaScript', $call['prompt']);
        $this->assertStringContainsString('medium', $call['prompt']);
        $this->assertStringContainsString('Debounce a search box.', $call['prompt']);
        $this->assertStringNotContainsString('A Python CSV importer.', $call['prompt']);
        $this->assertStringNotContainsString('A JavaScript quiz question.', $call['prompt']);

        $item = $call['responseSchema']['properties']['questions']['items'];
        $this->assertSame('ARRAY', $item['properties']['code']['type']);
        $issue = $item['properties']['issues']['items']['properties'];
        $this->assertArrayHasKey('firstLine', $issue);
        $this->assertArrayHasKey('lastLine', $issue);
        $this->assertSame(['bug', 'security', 'performance', 'concurrency', 'readability', 'testing'], $issue['category']['enum']);
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function badRequests(): array
    {
        return [
            'no language' => [['language' => null], 'language'],
            'an unknown language' => [['language' => 'cobol'], 'language'],
            'no difficulty' => [['difficulty' => null], 'difficulty'],
            'an unknown difficulty' => [['difficulty' => 'brutal'], 'difficulty'],
        ];
    }

    #[DataProvider('badRequests')]
    public function test_the_request_is_checked_before_the_model_is_asked(array $overrides, string $field): void
    {
        $gemini = FakeGeminiService::swap();
        Sanctum::actingAs(User::factory()->admin()->create());

        $this->postJson('/api/admin/practice/questions/generate', [...self::REQUEST, ...$overrides])
            ->assertUnprocessable()
            ->assertJsonValidationErrors($field);

        $gemini->assertNothingSent();
    }

    public function test_a_draft_is_never_served_or_reviewed(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $this->generate([self::item()], ['count' => 1])->assertOk();
        $draft = PracticeQuestion::sole();

        $gemini = FakeGeminiService::swap();
        Sanctum::actingAs(User::factory()->premium()->create());

        $this->getJson('/api/practice/code-review/next')->assertOk()->assertJsonPath('snippet', null);
        $this->getJson('/api/practice/code-review/next?language=javascript')->assertJsonPath('total', 0);
        $this->postJson("/api/practice/code-review/{$draft->id}/reviews", ['comments' => [['line' => 12, 'body' => 'Injection.']]])
            ->assertNotFound();
        $gemini->assertNothingSent();
    }

    private function aiDraft(array $attributes = []): PracticeQuestion
    {
        return PracticeQuestion::factory()->codeReview()->draft()->create(['source' => PracticeQuestionSource::Ai, ...$attributes]);
    }

    public function test_an_admin_edits_a_draft_and_publishes_it_and_users_are_served_it(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $draft = $this->aiDraft();
        $issues = $draft->answer['issues'];
        $issues[1]['lines'] = [11, 12];
        $issues[1]['fix'] = 'Start the offset at (page - 1) * size.';

        $this->patchJson("/api/admin/practice/questions/{$draft->id}", [
            'topic' => 'Orders, page by page',
            'prompt' => 'Returns one page of orders.',
            'answer' => ['issues' => $issues],
            'difficulty' => 'hard',
        ])
            ->assertOk()
            ->assertJsonPath('question.topic', 'Orders, page by page')
            ->assertJsonPath('question.answer.issues.1.lines', [11, 12]);

        $draft->refresh();
        $this->assertSame('hard', $draft->difficulty);
        $this->assertSame('Start the offset at (page - 1) * size.', $draft->answer['issues'][1]['fix']);

        $this->patchJson("/api/admin/practice/questions/{$draft->id}", ['status' => 'published'])
            ->assertOk()
            ->assertJsonPath('question.status', 'published');

        Sanctum::actingAs(User::factory()->premium()->create());
        $this->getJson('/api/practice/code-review/next')->assertJsonPath('snippet.id', $draft->id);
    }

    /** @return array<string, array{array<string, mixed>, string}> */
    public static function badEdits(): array
    {
        $issues = fn (array $second) => ['issues' => [
            ['id' => 'sql-injection', 'lines' => [3, 4], 'category' => 'security', 'severity' => 3, 'summary' => 'Injection.', 'fix' => 'Bind it.'],
            ['id' => 'off-by-one', 'lines' => [10, 10], 'category' => 'bug', 'severity' => 1, 'summary' => 'Off by one.', 'fix' => 'Subtract one.', ...$second],
        ]];

        return [
            'a range past the end' => [['answer' => $issues(['lines' => [24, 25]])], 'answer'],
            'a severity of 4' => [['answer' => $issues(['severity' => 4])], 'answer'],
            'a category not in the list' => [['answer' => $issues(['category' => 'style'])], 'answer'],
            'a repeated id' => [['answer' => $issues(['id' => 'sql-injection'])], 'answer'],
            'one issue' => [['answer' => ['issues' => [$issues([])['issues'][0]]]], 'answer'],
            'issues that are not a list' => [['answer' => ['issues' => 'none']], 'answer'],
            'code too short for the ranges' => [['code' => implode("\n", array_fill(0, 8, 'f();'))], 'code'],
            'code with tabs' => [['code' => implode("\n", array_fill(0, 24, "\tf();"))], 'code'],
            'no title' => [['topic' => ''], 'topic'],
            'no prompt' => [['prompt' => ''], 'prompt'],
            'no explanation' => [['explanation' => ''], 'explanation'],
            'an unknown language' => [['language' => 'cobol'], 'language'],
            'an unknown difficulty' => [['difficulty' => 'brutal'], 'difficulty'],
        ];
    }

    /** @param  array<string, mixed>  $edit */
    #[DataProvider('badEdits')]
    public function test_every_save_runs_the_same_checks_as_a_draft(array $edit, string $field): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $draft = $this->aiDraft();
        $before = $draft->fresh()->getAttributes();

        $this->patchJson("/api/admin/practice/questions/{$draft->id}", $edit)
            ->assertUnprocessable()
            ->assertJsonValidationErrors($field);

        $this->assertSame($before, $draft->fresh()->getAttributes());
    }

    public function test_publishing_checks_the_snippet_too(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $broken = $this->aiDraft(['answer' => ['issues' => []]]);

        $this->patchJson("/api/admin/practice/questions/{$broken->id}", ['status' => 'published'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('answer');

        $this->assertSame(PracticeQuestionStatus::Draft, $broken->fresh()->status);
    }

    public function test_an_edit_keeps_only_the_columns_a_snippet_has(): void
    {
        Sanctum::actingAs(User::factory()->admin()->create());
        $draft = $this->aiDraft();

        $this->patchJson("/api/admin/practice/questions/{$draft->id}", [
            'options' => ['a', 'b', 'c', 'd'],
            'reviewNotes' => ['distractors' => []],
        ])->assertOk();

        $draft->refresh();
        $this->assertNull($draft->options);
        $this->assertNull($draft->review_notes);
    }
}
