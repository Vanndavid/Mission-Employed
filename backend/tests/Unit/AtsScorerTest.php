<?php

namespace Tests\Unit;

use App\Services\Ats\AtsScorer;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class AtsScorerTest extends TestCase
{
    private AtsScorer $scorer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->scorer = new AtsScorer;
    }

    /** @return array<string, array{string, string, bool}> */
    public static function mentions(): array
    {
        return [
            'symbols after the term' => ['Built services in C++ and C#.', 'C++', true],
            'a hash language' => ['Built services in C++ and C#.', 'C#', true],
            'a dotted name' => ['REST APIs in Node.js and Express', 'Node.js', true],
            'a leading dot inside a longer name' => ['Five years of ASP.NET', '.NET', true],
            'a prefix of a longer word' => ['Five years of JavaScript', 'Java', false],
            'a letter that is really C++' => ['Five years of C++', 'C', false],
            'a letter that is really C#' => ['Five years of C#', 'C', false],
            'any case for a long term' => ['ran kubernetes clusters', 'Kubernetes', true],
            'a hyphen for a space' => ['A full-stack role', 'full stack', true],
            'a space for a hyphen' => ['A full stack role', 'full-stack', true],
            'an en dash for a hyphen' => ['A full–stack role', 'full-stack', true],
            'a simple plural' => ['Designed REST APIs', 'API', true],
            'an es plural' => ['Taught classes', 'class', true],
            'a short term in its own case' => ['Wrote Go services', 'Go', true],
            'a short term as an ordinary word' => ['Ready to go live', 'Go', false],
            'a short term never pluralises' => ['It goes live', 'Go', false],
            'a multi-word term across a line break' => ["Continuous\nintegration pipelines", 'continuous integration', true],
            'nothing like it' => ['Ten years of PHP', 'Terraform', false],
        ];
    }

    #[DataProvider('mentions')]
    public function test_it_matches_a_term_as_a_whole_token(string $cv, string $term, bool $expected): void
    {
        $this->assertSame($expected, $this->scorer->mentions($cv, $term));
    }

    public function test_an_alias_counts_as_the_keyword(): void
    {
        $report = $this->scorer->score([$this->keyword('Kubernetes', ['K8s'])], 'Ran K8s in production.', 'Engineer');

        $this->assertSame(['matched' => 1, 'total' => 1], $report['keywords']);
        $this->assertSame([['term' => 'Kubernetes', 'kind' => 'skill', 'required' => true]], $report['matched']);
        $this->assertSame([], $report['missing']);
    }

    public function test_required_keywords_weigh_double_and_soft_skills_half(): void
    {
        $keywords = [
            $this->keyword('Kubernetes', required: true),            // 2
            $this->keyword('Terraform', required: false),            // 1
            $this->keyword('mentoring', kind: 'soft_skill'),         // 1
            $this->keyword('public speaking', kind: 'soft_skill', required: false), // 0.5
        ];

        // Fails every format check, so the score is the keyword share alone:
        // 80 × 2 / 4.5 = 35.6.
        $report = $this->scorer->score($keywords, 'Kubernetes', 'Platform Engineer');

        $this->assertSame(0, $this->passedChecks($report));
        $this->assertSame(36, $report['score']);
        $this->assertSame(['matched' => 1, 'total' => 4], $report['keywords']);
    }

    public function test_missing_keywords_list_the_required_ones_first(): void
    {
        $report = $this->scorer->score([
            $this->keyword('GraphQL', required: false),
            $this->keyword('Terraform', required: true),
            $this->keyword('PHP', required: true),
            $this->keyword('Kafka', kind: 'qualification', required: true),
        ], 'Ten years of PHP.', 'Engineer');

        $this->assertSame(['Terraform', 'Kafka', 'GraphQL'], array_column($report['missing'], 'term'));
        $this->assertSame(
            ['term' => 'Kafka', 'kind' => 'qualification', 'required' => true],
            $report['missing'][1],
        );
    }

    public function test_a_cv_that_has_everything_scores_full_marks(): void
    {
        $report = $this->scorer->score(
            [$this->keyword('PHP'), $this->keyword('Laravel', required: false), $this->keyword('mentoring', kind: 'soft_skill')],
            $this->strongCv(),
            'Senior Software Engineer',
        );

        $this->assertSame(100, $report['score']);
        $this->assertSame(['contact', 'sections', 'title', 'length', 'measurable'], array_column($report['checks'], 'id'));
        $this->assertSame(5, $this->passedChecks($report));
    }

    public function test_the_same_input_always_gives_the_same_report(): void
    {
        $keywords = [$this->keyword('PHP'), $this->keyword('Go', required: false)];

        $this->assertSame(
            $this->scorer->score($keywords, $this->strongCv(), 'Software Engineer'),
            $this->scorer->score($keywords, $this->strongCv(), 'Software Engineer'),
        );
    }

    public function test_no_keywords_scores_on_format_alone(): void
    {
        $report = $this->scorer->score([], $this->strongCv(), 'Software Engineer');

        $this->assertSame(20, $report['score']);
        $this->assertSame(['matched' => 0, 'total' => 0], $report['keywords']);
    }

    public function test_contact_needs_an_email_and_a_phone_number(): void
    {
        $this->assertTrue($this->check("jane@example.com\n+61 412 345 678", 'contact')['passed']);
        $this->assertTrue($this->check('jane@example.com · (02) 9876 5432', 'contact')['passed']);

        $emailOnly = $this->check('jane@example.com', 'contact');
        $this->assertFalse($emailOnly['passed']);
        $this->assertStringContainsString('phone', $emailOnly['detail']);

        $phoneOnly = $this->check('+61 412 345 678', 'contact');
        $this->assertFalse($phoneOnly['passed']);
        $this->assertStringContainsString('email', $phoneOnly['detail']);
    }

    public function test_a_date_range_is_not_a_phone_number(): void
    {
        $this->assertFalse($this->check("jane@example.com\nAcme, 2019 - 2021", 'contact')['passed']);
        $this->assertFalse($this->check("jane@example.com\nAcme, 2019 – 2021 2022", 'contact')['passed']);
    }

    public function test_sections_need_experience_education_and_skills_headings(): void
    {
        $this->assertTrue($this->check("PROFESSIONAL EXPERIENCE\nx\nEducation:\nx\nTechnical Skills\nx", 'sections')['passed']);
        $this->assertTrue($this->check("## Work History\nx\n• Qualifications\nx\nTech stack\nx", 'sections')['passed']);

        $missing = $this->check("Experience\nx\nSkills\nx", 'sections');
        $this->assertFalse($missing['passed']);
        $this->assertStringContainsString('Education', $missing['detail']);

        // A sentence that happens to contain the word is not a heading.
        $this->assertFalse($this->check(
            "Experience\nx\nSkills\nx\nI am passionate about education and mentoring junior developers across teams.",
            'sections',
        )['passed']);
    }

    public function test_title_passes_on_the_role_with_or_without_its_seniority(): void
    {
        $this->assertTrue($this->check('Senior Software Engineer at Acme', 'title', 'Senior Software Engineer')['passed']);
        $this->assertTrue($this->check('Software Engineer at Acme', 'title', 'Senior Software Engineer')['passed']);
        // The detail names what was actually found, not the posting's title.
        $this->assertStringContainsString('"Software Engineer"', $this->check('Software Engineer at Acme', 'title', 'Senior Software Engineer')['detail']);
        $this->assertStringContainsString('"Senior Software Engineer"', $this->check('Senior Software Engineer at Acme', 'title', 'Senior Software Engineer')['detail']);
        $this->assertTrue($this->check('Backend Engineer at Acme', 'title', 'Backend Engineer (Contract)')['passed']);

        $missing = $this->check('Developer at Acme', 'title', 'Senior Platform Engineer');
        $this->assertFalse($missing['passed']);
        $this->assertStringContainsString('Senior Platform Engineer', $missing['detail']);
    }

    public function test_length_wants_between_three_hundred_and_a_thousand_words(): void
    {
        $this->assertFalse($this->check($this->words(200), 'length')['passed']);
        $this->assertTrue($this->check($this->words(300), 'length')['passed']);
        $this->assertTrue($this->check($this->words(1000), 'length')['passed']);
        $this->assertFalse($this->check($this->words(1200), 'length')['passed']);
        $this->assertStringContainsString('200 words', $this->check($this->words(200), 'length')['detail']);
    }

    public function test_measurable_wants_three_quantified_results(): void
    {
        $this->assertTrue($this->check('Cut costs 30%. Saved $40k. Made builds 3x faster.', 'measurable')['passed']);
        $this->assertTrue($this->check('Served 1,200,000 users, 10k rps, 99.9% uptime.', 'measurable')['passed']);

        $one = $this->check('Cut costs 30%. Worked at Acme 2019 - 2021.', 'measurable');
        $this->assertFalse($one['passed']);
        $this->assertStringContainsString('1 quantified result', $one['detail']);
    }

    /**
     * @param  list<string>  $aliases
     * @return array{term: string, aliases: list<string>, kind: string, required: bool}
     */
    private function keyword(string $term, array $aliases = [], string $kind = 'skill', bool $required = true): array
    {
        return ['term' => $term, 'aliases' => $aliases, 'kind' => $kind, 'required' => $required];
    }

    /** @return array{id: string, label: string, passed: bool, detail: string} */
    private function check(string $cv, string $id, string $role = 'Engineer'): array
    {
        $checks = $this->scorer->score([], $cv, $role)['checks'];

        return collect($checks)->firstWhere('id', $id);
    }

    /** @param  array<string, mixed>  $report */
    private function passedChecks(array $report): int
    {
        return count(array_filter($report['checks'], fn (array $check) => $check['passed']));
    }

    private function words(int $count): string
    {
        return implode(' ', array_fill(0, $count, 'word'));
    }

    private function strongCv(): string
    {
        return implode("\n", [
            'JANE DOE',
            'jane@example.com · +61 412 345 678',
            '',
            'Experience',
            'Software Engineer, Acme (2019 – 2024)',
            '- Cut API latency 40% by rewriting the PHP billing service in Laravel.',
            '- Saved $120k a year by retiring a legacy queue.',
            '- Grew test coverage 3x while mentoring two graduates.',
            '',
            'Education',
            'BSc Computer Science',
            '',
            'Skills',
            'PHP, Laravel, SQL, Go',
            '',
            $this->words(320),
        ]);
    }
}
