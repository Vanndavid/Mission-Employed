<?php

namespace App\Enums;

/**
 * The languages the quiz covers, and each one's topics. Mirrors
 * PracticeLanguage in frontend/types/practice.ts; the labels come from here,
 * through the catalog endpoint.
 *
 * The topics are code for the same reason the plan features are: questions
 * are validated against them (the seed bank, and an admin's question later),
 * so a typo cannot open a topic nobody can pick. Keys are stable: they are
 * stored on every question.
 */
enum PracticeLanguage: string
{
    case JavaScript = 'javascript';
    case Python = 'python';
    case Java = 'java';
    case Sql = 'sql';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }

    public function label(): string
    {
        return match ($this) {
            self::JavaScript => 'JavaScript',
            self::Python => 'Python',
            self::Java => 'Java',
            self::Sql => 'SQL',
        };
    }

    /**
     * Topic key => label, in the order the quiz menu lists them.
     *
     * @return array<string, string>
     */
    public function topics(): array
    {
        return match ($this) {
            self::JavaScript => [
                'scope' => 'Scope, hoisting & closures',
                'types' => 'Types, equality & coercion',
                'async' => 'Promises, async & the event loop',
                'arrays' => 'Arrays, objects & collections',
                'this' => 'this, classes & prototypes',
                'syntax' => 'Modern syntax',
            ],
            self::Python => [
                'types' => 'Built-in types & mutability',
                'functions' => 'Functions, arguments & closures',
                'iteration' => 'Comprehensions, iterators & generators',
                'classes' => 'Classes & data model',
                'errors' => 'Exceptions & context managers',
                'performance' => 'Complexity & performance',
            ],
            self::Java => [
                'basics' => 'Types, operators & arithmetic',
                'strings' => 'Strings & equality',
                'oop' => 'Classes, inheritance & polymorphism',
                'collections' => 'Collections & complexity',
                'exceptions' => 'Exceptions & resources',
                'streams' => 'Lambdas, streams & Optional',
            ],
            self::Sql => [
                'filtering' => 'Filtering, NULL & ordering',
                'joins' => 'Joins',
                'aggregation' => 'GROUP BY & aggregates',
                'subqueries' => 'Subqueries & CTEs',
                'windows' => 'Window functions',
                'indexes' => 'Indexes & transactions',
            ],
        };
    }
}
