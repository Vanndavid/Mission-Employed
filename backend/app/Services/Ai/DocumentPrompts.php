<?php

namespace App\Services\Ai;

/**
 * Prompts for the tailored cover letter and CV.
 *
 * Ported from `generateCoverLetter`, `generateTailoredCV`,
 * `createCoverLetterSession` and `createCVSession` in the retired Express
 * server. The refine instructions become a session's system instruction, and
 * its turns go through the shared session-turn endpoint.
 */
class DocumentPrompts
{
    public const DEFAULT_LETTER_TEMPLATE = 'Professional, concise, maintenance SWE tone';

    public const DEFAULT_CV_TEMPLATE = 'Reorder and emphasize relevant experience. Match keywords from the JD. Keep all facts truthful — do not invent experience. One page, ATS-friendly plain text.';

    /** @param  array<string, mixed>  $input */
    public static function coverLetter(array $input): string
    {
        $company = self::field($input, 'company');
        $role = self::field($input, 'role');
        $jobDescription = self::field($input, 'jobDescription');
        $cv = self::field($input, 'cv');
        $portfolioUrl = self::field($input, 'portfolioUrl') ?: 'N/A';
        $template = self::field($input, 'template') ?: self::DEFAULT_LETTER_TEMPLATE;

        return <<<PROMPT
            Write a tailored cover letter for:
            Company: {$company}
            Role: {$role}
            Job Description: {$jobDescription}
            Candidate CV summary: {$cv}
            Portfolio: {$portfolioUrl}
            Template/style notes: {$template}

            Keep it under 350 words. No placeholder brackets.
            PROMPT;
    }

    /** @param  array<string, mixed>  $input */
    public static function tailoredCv(array $input): string
    {
        $company = self::field($input, 'company');
        $role = self::field($input, 'role');
        $jobDescription = self::field($input, 'jobDescription');
        $cv = self::field($input, 'cv');
        $portfolioUrl = self::field($input, 'portfolioUrl') ?: 'N/A';
        $template = self::field($input, 'template') ?: self::DEFAULT_CV_TEMPLATE;

        return <<<PROMPT
            Tailor this candidate's CV for a specific job application.

            Company: {$company}
            Role: {$role}
            Job Description: {$jobDescription}
            Base CV: {$cv}
            Portfolio: {$portfolioUrl}
            Tailoring instructions: {$template}

            Return the full tailored CV as plain text. No placeholder brackets. Preserve contact details from the base CV.
            PROMPT;
    }

    /** @param  array{company: string, role: string, jobDescription: string, document: string}  $refine */
    public static function coverLetterRefineInstruction(array $refine): string
    {
        return <<<PROMPT
            You help refine cover letters for {$refine['role']} at {$refine['company']}.
            Job Description: {$refine['jobDescription']}
            Current letter: {$refine['document']}
            Make targeted edits based on user feedback. Return the full revised letter.
            PROMPT;
    }

    /** @param  array{company: string, role: string, jobDescription: string, document: string}  $refine */
    public static function cvRefineInstruction(array $refine): string
    {
        return <<<PROMPT
            You help refine tailored CVs for {$refine['role']} at {$refine['company']}.
            Job Description: {$refine['jobDescription']}
            Current CV: {$refine['document']}
            Make targeted edits based on user feedback. Return the full revised CV. Never fabricate experience.
            PROMPT;
    }

    /** @param  array<string, mixed>  $input */
    private static function field(array $input, string $key): string
    {
        $value = $input[$key] ?? '';

        return is_scalar($value) ? trim((string) $value) : '';
    }
}
