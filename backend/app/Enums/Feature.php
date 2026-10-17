<?php

namespace App\Enums;

use App\Models\PlanFeature;
use App\Services\Plans\FeatureSetting;

/**
 * The features a plan can include. Mirrors FeatureKey in frontend/types/auth.ts.
 *
 * The catalog is code because each case is enforced by the `feature`
 * middleware on its routes (routes/api/ai.php), so an admin cannot invent one.
 * What an admin controls is which plans include each feature and how often
 * ({@see PlanFeature}). A feature with nothing stored for a plan reads as
 * defaultSetting(), so a new case reaches production with sensible access and
 * no data migration.
 *
 * A use is one request that reached the model (or Seek). Opening, reading or
 * deleting a session needs access but costs nothing.
 */
enum Feature: string
{
    case CodingProblem = 'coding_problem';
    case CodingTutor = 'coding_tutor';
    case JobParse = 'job_parse';
    case SpreadsheetImport = 'spreadsheet_import';
    case CoverLetter = 'cover_letter';
    case TailoredCv = 'tailored_cv';
    case AtsCheck = 'ats_check';
    case SeekJobs = 'seek_jobs';
    case InterviewPractice = 'interview_practice';
    case SpokenPlayback = 'spoken_playback';
    case MockInterview = 'mock_interview';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }

    /**
     * The feature a stored chat session belongs to, so a refine chat counts
     * against the document it refines rather than against the tutor.
     */
    public static function forSessionKind(string $kind): self
    {
        return match ($kind) {
            'coding' => self::CodingTutor,
            'cover_letter' => self::CoverLetter,
            'cv' => self::TailoredCv,
            'mock' => self::MockInterview,
            'behavioral' => self::InterviewPractice,
        };
    }

    /** Singular, so "… is a Premium feature" reads. */
    public function label(): string
    {
        return match ($this) {
            self::CodingProblem => 'Coding problem generator',
            self::CodingTutor => 'AI coding tutor',
            self::JobParse => 'Job description parsing',
            self::SpreadsheetImport => 'AI column matching',
            self::CoverLetter => 'Cover letter writer',
            self::TailoredCv => 'Tailored CV writer',
            self::AtsCheck => 'ATS score check',
            self::SeekJobs => 'Seek job search',
            self::InterviewPractice => 'Interview practice',
            self::SpokenPlayback => 'Spoken playback',
            self::MockInterview => 'Mock interview',
        };
    }

    /** What it does and what counts as one use, for the plans page. */
    public function description(): string
    {
        return match ($this) {
            self::CodingProblem => 'A fresh coding problem at the difficulty you pick. Each problem is one use.',
            self::CodingTutor => 'A tutor to talk the problem through with. Each message is one use.',
            self::JobParse => 'Paste a job ad and the application fills itself in. Each parse is one use.',
            self::SpreadsheetImport => 'Matches a spreadsheet\'s columns on import. Without it, columns are matched by name.',
            self::CoverLetter => 'A cover letter written for the job, then refined in chat. Each letter or message is one use.',
            self::TailoredCv => 'Your CV tailored to the job, then refined in chat. Each CV or message is one use.',
            self::AtsCheck => 'Scores a CV against the job description. Re-checking against the same job is free.',
            self::SeekJobs => 'Live listings from Seek on the Job Applications page. Each search is one use.',
            self::InterviewPractice => 'A practice question, then feedback on your spoken answer. Each question or answer is one use.',
            self::SpokenPlayback => 'Practice questions read aloud. Each playback is one use.',
            self::MockInterview => 'A full interview ending in a written report. Each typed answer, voice connection or report is one use.',
        };
    }

    public function group(): string
    {
        return match ($this) {
            self::CodingProblem, self::CodingTutor => 'Coding practice',
            self::JobParse, self::SpreadsheetImport, self::CoverLetter, self::TailoredCv,
            self::AtsCheck, self::SeekJobs => 'Job applications',
            self::InterviewPractice, self::SpokenPlayback => 'Interview practice',
            self::MockInterview => 'Mock interview',
        };
    }

    /**
     * What a plan gets until an admin says otherwise. Free keeps every AI
     * feature off, as before plans were configurable, but with a small
     * monthly allowance ready for when an admin switches one on. Premium gets
     * daily caps sized well above real use, there to stop a script, not a
     * person.
     */
    public function defaultSetting(AccountPlan $plan): FeatureSetting
    {
        if ($plan === AccountPlan::Free) {
            return $this === self::SeekJobs
                ? new FeatureSetting($this, true, 100, QuotaPeriod::Day)
                : new FeatureSetting($this, false, 5, QuotaPeriod::Month);
        }

        $daily = match ($this) {
            self::CodingProblem => 30,
            self::CodingTutor => 200,
            self::JobParse => 50,
            self::SpreadsheetImport => 20,
            self::CoverLetter, self::TailoredCv => 60,
            self::AtsCheck => 50,
            self::SeekJobs => 300,
            self::InterviewPractice => 60,
            self::SpokenPlayback => 100,
            self::MockInterview => 100,
        };

        return new FeatureSetting($this, true, $daily, QuotaPeriod::Day);
    }
}
