<?php

namespace App\Services\Ai;

/**
 * Prompt and schema for the ATS score check.
 *
 * The model only reads the job description and lists its keywords. It never
 * sees the CV and never gives a score: App\Services\Ats\AtsScorer matches the
 * keywords against the CV deterministically, the way an ATS keyword screen
 * would. Same split as the spreadsheet import, where the model maps the
 * sheet's vocabulary and the rows are applied by code.
 */
class AtsPrompts
{
    public const KINDS = ['skill', 'qualification', 'soft_skill'];

    public static function keywords(string $role, string $jobDescription): string
    {
        return <<<PROMPT
            You are the keyword screen of an applicant tracking system. List the keywords a recruiter would search candidates' CVs for when filling this job.

            Role: {$role}
            Job description:
            """
            {$jobDescription}
            """

            For each keyword:
            - term: the keyword's standard name as the posting uses it, as short as it can be ("Kubernetes", "PostgreSQL", "CI/CD", "stakeholder management").
            - aliases: other ways a CV might write the same thing ("K8s", "Postgres"). Empty when there are none.
            - kind: "skill" for languages, frameworks, tools, platforms and methods; "qualification" for degrees, certifications and licences; "soft_skill" for interpersonal skills.
            - required: true if the posting asks for it outright, false if it is preferred, a bonus or nice to have.

            Leave out the company's name, benefits, years of experience, and generic words like "team", "experience" or "software".
            List at most 30 keywords, most important first.
            PROMPT;
    }

    /** @return array<string, mixed> */
    public static function keywordsSchema(): array
    {
        return [
            'type' => 'OBJECT',
            'properties' => [
                'keywords' => [
                    'type' => 'ARRAY',
                    'items' => [
                        'type' => 'OBJECT',
                        'properties' => [
                            'term' => ['type' => 'STRING'],
                            'aliases' => ['type' => 'ARRAY', 'items' => ['type' => 'STRING']],
                            'kind' => ['type' => 'STRING', 'enum' => self::KINDS],
                            'required' => ['type' => 'BOOLEAN'],
                        ],
                        'required' => ['term', 'kind', 'required'],
                    ],
                ],
            ],
            'required' => ['keywords'],
        ];
    }
}
