<?php

namespace Tests\Feature;

use App\Models\PracticeQuestion;
use App\Models\User;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

/**
 * GET /api/practice/code-review/next?category=: the coach on Mission Control
 * starts a review in the user's weakest issue category, so a snippet can be
 * asked for by the category of an issue planted in it. Which issues it has
 * still never leaves the server.
 */
class PracticeCodeReviewCategoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_next_serves_only_snippets_with_an_issue_in_the_category_asked_for(): void
    {
        Sanctum::actingAs(User::factory()->premium()->create());

        // Planted: a security issue and a bug.
        $mixed = PracticeQuestion::factory()->codeReview()->create();
        $slow = PracticeQuestion::factory()->codeReview()->create([
            'answer' => ['issues' => [
                ['id' => 'n-plus-one', 'lines' => [5, 8], 'category' => 'performance', 'severity' => 2, 'summary' => 'One query per order.', 'fix' => 'Load them in one query.'],
                ['id' => 'magic-number', 'lines' => [12, 12], 'category' => 'readability', 'severity' => 1, 'summary' => 'An unexplained 86400.', 'fix' => 'Name the constant.'],
            ]],
        ]);
        PracticeQuestion::factory()->codeReview()->draft()->create([
            'answer' => ['issues' => [
                ['id' => 'race', 'lines' => [5, 8], 'category' => 'concurrency', 'severity' => 3, 'summary' => 'Two writers.', 'fix' => 'Lock it.'],
            ]],
        ]);

        $this->getJson('/api/practice/code-review/next?category=performance')
            ->assertOk()
            ->assertJsonPath('snippet.id', $slow->id)
            ->assertJsonPath('total', 1)
            ->assertJsonMissingPath('snippet.issues');

        $this->getJson('/api/practice/code-review/next?category=security')
            ->assertOk()
            ->assertJsonPath('snippet.id', $mixed->id)
            ->assertJsonPath('total', 1);

        // A draft is never served, whatever is planted in it.
        $this->getJson('/api/practice/code-review/next?category=concurrency')
            ->assertOk()
            ->assertJsonPath('snippet', null)
            ->assertJsonPath('total', 0);

        $this->getJson('/api/practice/code-review/next')->assertOk()->assertJsonPath('total', 2);

        $this->getJson('/api/practice/code-review/next?category=style')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('category');
    }
}
