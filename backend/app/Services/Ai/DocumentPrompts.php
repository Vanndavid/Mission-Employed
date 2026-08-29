<?php

namespace App\Services\Ai;

/**
 * Prompts for the tailored cover letter and CV.
 *
 * Ported from `generateCoverLetter` and `generateTailoredCV` in
 * server/aiHandlers.js. The refine-chat siblings (createCoverLetterSession,
 * createCVSession) have no route of their own yet; if they come back they can
 * reuse the shared session-turn endpoint, since AiSession::KINDS already
 * carries `cover_letter` and `cv`.
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

    /** @param  array<string, mixed>  $input */
    private static function field(array $input, string $key): string
    {
        $value = $input[$key] ?? '';

        return is_scalar($value) ? trim((string) $value) : '';
    }
}
