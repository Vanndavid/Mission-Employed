<?php

namespace App\Services\Practice;

/**
 * The fixed rubric a system design answer is scored against, after Eleph's
 * writing rubric (src/features/pte/lib/writingRubric.ts): everything that
 * can be counted is decided here in code, and the model only rates the
 * traits that pass the gates, against the descriptors written below.
 *
 *  - An answer is written in fixed SECTIONS. Each trait reads some of them.
 *  - Gate: a trait whose sections have fewer than MIN_WORDS words between
 *    them scores 0, and the model is never asked about it: its name,
 *    descriptors and key points are left out of the prompt. (What was
 *    written is still part of the answer the model reads, for
 *    Communication.)
 *  - The model rates every other trait 0 to TRAIT_MAX
 *    ({@see SystemDesignScorer}); code weights the ratings and sums them to
 *    a score out of MAX_SCORE.
 *
 * The descriptors are product copy: users read them under "How this was
 * scored". Changing what a score means (a descriptor, a weight, the gate)
 * is a new VERSION, because every attempt stores the version it was scored
 * against so scores stay comparable over time.
 */
final class SystemDesignRubric
{
    public const VERSION = 'sd-1';

    /** Every trait is rated 0 to this. */
    public const TRAIT_MAX = 4;

    /** Fewer words than this across a trait's sections scores it 0, unasked. */
    public const MIN_WORDS = 15;

    public const MAX_SCORE = 100;

    /**
     * The sections an answer is written in, in order. Mirrors
     * SystemDesignSectionKey in frontend/types/systemDesign.ts.
     *
     * @var array<string, array{label: string, hint: string}>
     */
    public const SECTIONS = [
        'requirements' => [
            'label' => 'Requirements',
            'hint' => 'Functional and non-functional: what it must do, how fast, how available and how consistent it must be, and what is out of scope.',
        ],
        'estimates' => [
            'label' => 'Estimates',
            'hint' => 'Requests a second at average and peak, storage over the time you keep the data, and bandwidth or cache size, from assumptions you state.',
        ],
        'api' => [
            'label' => 'API',
            'hint' => 'The main operations: method and path or signature, what goes in, what comes back, and the errors.',
        ],
        'data_model' => [
            'label' => 'Data model',
            'hint' => 'The entities with their keys and indexes, and which store holds them and why.',
        ],
        'high_level' => [
            'label' => 'High-level design',
            'hint' => 'The components, and how a request travels through them on the main read and write paths.',
        ],
        'deep_dive' => [
            'label' => 'Deep dive and scaling',
            'hint' => 'The bottleneck your estimates point to and how you remove it: partitioning, caching, replication, queues, hot keys.',
        ],
        'tradeoffs' => [
            'label' => 'Trade-offs and failure modes',
            'hint' => 'What fails and what happens then, and the choices you made against an alternative you turned down.',
        ],
    ];

    /**
     * The traits, in report order. Weights are whole multiples of TRAIT_MAX
     * so every rating is a whole number of points, and they sum to
     * MAX_SCORE. Mirrors SystemDesignTraitKey in
     * frontend/types/systemDesign.ts.
     *
     * @var array<string, array{label: string, weight: int, sections: list<string>, descriptors: array<int, string>}>
     */
    public const TRAITS = [
        'requirements' => [
            'label' => 'Requirements and scope',
            'weight' => 12,
            'sections' => ['requirements'],
            'descriptors' => [
                4 => 'Separates functional from non-functional requirements, names the core use cases and what is out of scope, puts numbers on latency, availability and data retention, and states the assumptions the rest of the design relies on.',
                3 => 'Covers the core use cases and the main non-functional requirements, but leaves one important requirement implicit or gives a target without a number.',
                2 => 'Lists features, but the non-functional requirements are generic ("scalable", "fast") or missing, and the scope is not drawn.',
                1 => 'Mostly restates the prompt, with no non-functional requirements and nothing that narrows down what is being built.',
                0 => 'No requirements, or requirements for a different problem than the one asked.',
            ],
        ],
        'estimation' => [
            'label' => 'Estimation',
            'weight' => 12,
            'sections' => ['estimates'],
            'descriptors' => [
                4 => 'Works out the numbers that drive the design (requests a second at average and peak, storage over the retention period, bandwidth or cache size) from stated assumptions, with arithmetic that holds up, and says which number shapes which decision.',
                3 => 'Gets the main numbers right from stated assumptions, with a small slip or one missing figure such as peak or storage, and links them to decisions only in part.',
                2 => 'Gives some numbers, but the assumptions are missing or the arithmetic is off by an order of magnitude, and the numbers are not used later.',
                1 => 'Describes scale only in words ("lots of traffic"), or gives figures with no working.',
                0 => 'No estimate of traffic, storage or any other figure.',
            ],
        ],
        'api_data_model' => [
            'label' => 'API and data model',
            'weight' => 16,
            'sections' => ['api', 'data_model'],
            'descriptors' => [
                4 => 'Defines the main operations with inputs, outputs and errors, plus pagination or idempotency where they matter, and a schema with keys and indexes whose store is chosen for the access patterns.',
                3 => 'Covers the main operations and entities with sensible keys, but misses one important detail (an index, idempotency, pagination, how an id is generated) or justifies the store only loosely.',
                2 => 'Outlines endpoints or tables without fields, keys or reasons; a store is named but not justified.',
                1 => 'Says little more than "a REST API and a database", with no concrete operations or entities.',
                0 => 'Neither an API nor a data model is described.',
            ],
        ],
        'architecture' => [
            'label' => 'Architecture',
            'weight' => 20,
            'sections' => ['high_level'],
            'descriptors' => [
                4 => 'Names every component a request touches (load balancer, services, stores, caches, queues) and walks the main read and write paths end to end; each component has a clear job and together they meet the stated requirements.',
                3 => 'A workable design with the main components and paths, but one path is vague or one component\'s job is unclear.',
                2 => 'Lists components without describing how a request moves between them, or leaves a core requirement unmet.',
                1 => 'A single box ("a server and a database"), or a design that would not work for this problem.',
                0 => 'No components and no request flow are described.',
            ],
        ],
        'scalability' => [
            'label' => 'Scalability',
            'weight' => 16,
            'sections' => ['deep_dive'],
            'descriptors' => [
                4 => 'Finds the real bottleneck from the estimates and removes it concretely: what is partitioned and on which key, what is cached and how it stays fresh, what is replicated or made asynchronous, and how hot keys or uneven load are handled.',
                3 => 'Scales the main bottleneck with specific techniques, but leaves one important pressure point unaddressed or names a technique without saying how it applies here.',
                2 => 'Generic scaling ("add servers", "use a cache", "shard the database") without saying where, on what key, or why.',
                1 => 'Mentions scale, but nothing that would change how the system behaves under load.',
                0 => 'Nothing on how the system copes with more data or more load.',
            ],
        ],
        'reliability' => [
            'label' => 'Reliability and trade-offs',
            'weight' => 16,
            'sections' => ['tradeoffs'],
            'descriptors' => [
                4 => 'Names the important failure modes (a node, a zone or a dependency going down; retries, duplicates, lost data) with a mitigation for each, and argues the key trade-offs, such as consistency against availability or cost against latency, against an alternative that was turned down.',
                3 => 'Covers the main failure modes and at least one real trade-off, but a mitigation is thin or no alternative is weighed.',
                2 => 'Talks about failure or trade-offs in general terms ("add replication", "it is eventually consistent") without tying them to this design.',
                1 => 'A passing mention of failure or trade-offs.',
                0 => 'Nothing on failure modes or trade-offs.',
            ],
        ],
        'communication' => [
            'label' => 'Communication',
            'weight' => 8,
            'sections' => ['requirements', 'estimates', 'api', 'data_model', 'high_level', 'deep_dive', 'tradeoffs'],
            'descriptors' => [
                4 => 'Easy to follow from requirements to design: components keep one name throughout, assumptions are stated where they are made, every decision is tied to a requirement or an estimate, and it is precise without padding.',
                3 => 'Clear and well organised, with an occasional unexplained leap or undefined term.',
                2 => 'Can be followed with effort: decisions arrive without reasons, or sections contradict each other.',
                1 => 'Hard to follow: disorganised, or mostly buzzwords.',
                0 => 'Cannot be followed: the parts do not connect into a design.',
            ],
        ],
    ];

    /** Words as runs of non-space that contain a letter or a digit, so "-" and "->" do not count. */
    public static function wordCount(string $text): int
    {
        $tokens = preg_split('/\s+/u', trim($text), -1, PREG_SPLIT_NO_EMPTY) ?: [];

        return count(array_filter($tokens, fn (string $token) => preg_match('/[\p{L}\p{N}]/u', $token) === 1));
    }

    /**
     * Every section, trimmed, '' where nothing was written.
     *
     * @param  array<string, mixed>  $input
     * @return array<string, string>
     */
    public static function normaliseSections(array $input): array
    {
        $sections = [];
        foreach (array_keys(self::SECTIONS) as $key) {
            $value = $input[$key] ?? null;
            $sections[$key] = is_string($value) ? trim($value) : '';
        }

        return $sections;
    }

    /**
     * The words each trait reads, across its sections.
     *
     * @param  array<string, string>  $sections
     * @return array<string, int>
     */
    public static function traitWords(array $sections): array
    {
        $words = [];
        foreach (self::TRAITS as $key => $trait) {
            $words[$key] = array_sum(array_map(
                fn (string $section) => self::wordCount($sections[$section] ?? ''),
                $trait['sections'],
            ));
        }

        return $words;
    }

    /**
     * Traits that score 0 without being read, in rubric order.
     *
     * @param  array<string, string>  $sections
     * @return list<string>
     */
    public static function gatedTraits(array $sections): array
    {
        return array_keys(array_filter(self::traitWords($sections), fn (int $words) => $words < self::MIN_WORDS));
    }

    /**
     * Traits the model is asked to rate, in rubric order.
     *
     * @param  array<string, string>  $sections
     * @return list<string>
     */
    public static function judgedTraits(array $sections): array
    {
        return array_keys(array_filter(self::traitWords($sections), fn (int $words) => $words >= self::MIN_WORDS));
    }

    public static function clamp(int $score): int
    {
        return max(0, min(self::TRAIT_MAX, $score));
    }

    /** What a rating is worth out of MAX_SCORE. Exact: weights are multiples of TRAIT_MAX. */
    public static function points(string $trait, int $score): int
    {
        $weight = self::TRAITS[$trait]['weight'] ?? 0;

        return intdiv($weight * self::clamp($score), self::TRAIT_MAX);
    }

    /**
     * The score out of MAX_SCORE. A trait with no rating counts 0; a key that
     * is not a trait counts nothing.
     *
     * @param  array<string, int>  $scores  trait => 0..TRAIT_MAX
     */
    public static function total(array $scores): int
    {
        $total = 0;
        foreach (array_keys(self::TRAITS) as $trait) {
            $total += self::points($trait, (int) ($scores[$trait] ?? 0));
        }

        return $total;
    }

    public static function descriptor(string $trait, int $score): string
    {
        return self::TRAITS[$trait]['descriptors'][self::clamp($score)];
    }

    /**
     * The scored answer, trait by trait. Gated traits score 0 whatever a
     * judgement says; every other trait takes its sanitised rating
     * ({@see SystemDesignScorer::sanitise()}). Key points are split into
     * the ones the answer covered and the ones it missed.
     *
     * @param  array<string, string>  $sections  from normaliseSections()
     * @param  array<string, list<string>>  $keyPoints  trait => expected key points
     * @param  array<string, array{score: int, evidence: string|null, improvement: string|null, covered: list<int>}>  $judged
     * @return array{score: int, maxScore: int, rubricVersion: string, traits: list<array<string, mixed>>}
     */
    public static function report(array $sections, array $keyPoints, array $judged): array
    {
        $words = self::traitWords($sections);
        $traits = [];
        $scores = [];

        foreach (self::TRAITS as $key => $trait) {
            $gated = $words[$key] < self::MIN_WORDS;
            $rating = $gated ? null : ($judged[$key] ?? null);
            $score = self::clamp((int) ($rating['score'] ?? 0));
            $points = $keyPoints[$key] ?? [];
            $covered = array_values(array_intersect_key($points, array_flip($rating['covered'] ?? [])));

            $scores[$key] = $score;
            $traits[] = [
                'key' => $key,
                'label' => $trait['label'],
                'score' => $score,
                'max' => self::TRAIT_MAX,
                'points' => self::points($key, $score),
                'maxPoints' => $trait['weight'],
                'gated' => $gated,
                'words' => $words[$key],
                'descriptor' => self::descriptor($key, $score),
                'evidence' => $rating['evidence'] ?? null,
                'improvement' => $gated ? self::gateAdvice($key, $words[$key]) : ($rating['improvement'] ?? null),
                'keyPoints' => [
                    'covered' => $covered,
                    'missed' => array_values(array_diff_key($points, array_flip($rating['covered'] ?? []))),
                ],
            ];
        }

        return [
            'score' => self::total($scores),
            'maxScore' => self::MAX_SCORE,
            'rubricVersion' => self::VERSION,
            'traits' => $traits,
        ];
    }

    /**
     * The rubric as the client shows it: the sections to write, the gate,
     * and each trait's weight and descriptors (index = score).
     *
     * @return array<string, mixed>
     */
    public static function present(): array
    {
        return [
            'version' => self::VERSION,
            'traitMax' => self::TRAIT_MAX,
            'maxScore' => self::MAX_SCORE,
            'minWords' => self::MIN_WORDS,
            'sections' => array_map(
                fn (string $key, array $section) => ['key' => $key, ...$section],
                array_keys(self::SECTIONS),
                self::SECTIONS,
            ),
            'traits' => array_map(
                fn (string $key, array $trait) => [
                    'key' => $key,
                    'label' => $trait['label'],
                    'weight' => $trait['weight'],
                    'sections' => $trait['sections'],
                    'descriptors' => array_values(array_map(
                        fn (int $score) => $trait['descriptors'][$score],
                        range(0, self::TRAIT_MAX),
                    )),
                ],
                array_keys(self::TRAITS),
                self::TRAITS,
            ),
        ];
    }

    /** Why a gated trait scored 0, and what to write next time. */
    private static function gateAdvice(string $trait, int $words): string
    {
        $sections = array_map(fn (string $s) => self::SECTIONS[$s]['label'], self::TRAITS[$trait]['sections']);
        $count = $words === 1 ? '1 word' : "{$words} words";

        if (count($sections) === count(self::SECTIONS)) {
            return "The whole answer had {$count}: it needs at least ".self::MIN_WORDS.' to be assessed.';
        }

        $where = count($sections) === 1
            ? "{$sections[0]} had {$count}"
            : implode(' and ', $sections)." had {$count} between them";

        $hints = implode(' ', array_map(fn (string $s) => self::SECTIONS[$s]['hint'], self::TRAITS[$trait]['sections']));

        return "{$where}: a trait needs at least ".self::MIN_WORDS." to be assessed, so the AI was not asked about it. Next time, cover: {$hints}";
    }
}
