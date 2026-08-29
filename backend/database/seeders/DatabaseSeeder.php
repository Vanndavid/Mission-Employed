<?php

namespace Database\Seeders;

use App\Enums\AccountPlan;
use App\Enums\AccountRole;
use App\Enums\JobStatus;
use App\Models\AiMessage;
use App\Models\AiSession;
use App\Models\Application;
use App\Models\ApplicationStatusEvent;
use App\Models\BehavioralAnswer;
use App\Models\CodingAttempt;
use App\Models\InterviewStage;
use App\Models\Profile;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Hash;

/**
 * Development seed data: one admin (premium) and one ordinary free user, each
 * with a profile and a couple of applications, so the UI has something to show.
 *
 * Credentials come from the environment when set, otherwise from the obviously
 * fake defaults below. Never run this against production data.
 */
class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        $admin = $this->makeUser(
            email: env('SEED_ADMIN_EMAIL', 'admin@mission-employed.test'),
            password: env('SEED_ADMIN_PASSWORD', 'password'),
            name: 'Mission Control',
            role: AccountRole::Admin,
            plan: AccountPlan::Premium,
        );

        $member = $this->makeUser(
            email: env('SEED_USER_EMAIL', 'user@mission-employed.test'),
            password: env('SEED_USER_PASSWORD', 'password'),
            name: 'Sam Jobseeker',
            role: AccountRole::User,
            plan: AccountPlan::Free,
        );

        $this->seedAdminData($admin);
        $this->seedMemberData($member);
    }

    private function makeUser(string $email, string $password, string $name, AccountRole $role, AccountPlan $plan): User
    {
        return User::updateOrCreate(
            ['email' => $email],
            [
                'name' => $name,
                'password' => Hash::make($password),
                'role' => $role,
                'plan' => $plan,
            ],
        );
    }

    private function seedAdminData(User $admin): void
    {
        Profile::updateOrCreate(['user_id' => $admin->id], [
            'base_cv' => "Mission Control\nStaff Software Engineer\n\nExperience\n- Ran the hunt.\n",
            'cv_file_name' => 'mission-control-cv.pdf',
            'base_cover_letter' => "Dear hiring manager,\n\nI build reliable systems.\n",
            'portfolio_url' => 'https://example.test/mission-control',
            'cover_letter_template' => 'Hook, proof, ask.',
            'cv_template' => 'Summary, experience, projects, education.',
        ]);

        $offer = Application::updateOrCreate(
            ['user_id' => $admin->id, 'company' => 'Northwind Systems'],
            [
                'role' => 'Staff Software Engineer',
                'location' => 'London, UK',
                'url' => 'https://example.test/jobs/northwind-staff',
                'status' => JobStatus::Offer,
                'date_applied' => now()->subDays(40)->toDateString(),
                'notes' => 'Strong platform team. Negotiating start date.',
                'job_description' => 'Own the deployment platform end to end.',
                'next_action' => 'Reply to the offer email',
                'next_action_due' => now()->addDays(3)->toDateString(),
                'recruiter_name' => 'Priya Raman',
                'recruiter_email' => 'priya@example.test',
                'recruiter_linkedin' => 'https://www.linkedin.com/in/priya-raman-example',
                'offer' => [
                    'base' => 120000,
                    'equity' => '0.15% over 4 years',
                    'benefits' => 'Private health, 28 days holiday',
                    'startDate' => now()->addMonth()->toDateString(),
                ],
                'take_home' => null,
            ],
        );

        $this->syncStatusHistory($offer, [
            [JobStatus::Saved, now()->subDays(45)],
            [JobStatus::Applied, now()->subDays(40)],
            [JobStatus::Interviewing, now()->subDays(25)],
            [JobStatus::Offer, now()->subDays(4)],
        ]);

        $this->syncStages($offer, [
            ['phone', now()->subDays(33), 'Recruiter screen — comp range confirmed.'],
            ['technical', now()->subDays(26), 'Debugging exercise, went well.'],
            ['onsite', now()->subDays(12), 'Four panels, met the whole team.'],
        ]);

        $rejected = Application::updateOrCreate(
            ['user_id' => $admin->id, 'company' => 'Halcyon Labs'],
            [
                'role' => 'Backend Engineer',
                'location' => 'Remote',
                'url' => 'https://example.test/jobs/halcyon-backend',
                'status' => JobStatus::Rejected,
                'date_applied' => now()->subDays(70)->toDateString(),
                'notes' => 'Rejected after the take-home. Feedback: wanted more Go.',
                'job_description' => 'Go services on Kubernetes.',
                'next_action' => '',
                'next_action_due' => null,
                'recruiter_name' => null,
                'recruiter_email' => null,
                'recruiter_linkedin' => null,
                'offer' => null,
                'take_home' => [
                    'deadline' => now()->subDays(60)->toDateString(),
                    'repo' => 'https://github.com/example/halcyon-take-home',
                    'status' => 'submitted',
                ],
            ],
        );

        $this->syncStatusHistory($rejected, [
            [JobStatus::Applied, now()->subDays(70)],
            [JobStatus::Interviewing, now()->subDays(64)],
            [JobStatus::Rejected, now()->subDays(55)],
        ]);

        $this->syncStages($rejected, [
            ['take_home', now()->subDays(63), 'Rate-limiter service in Go.'],
        ]);

        $this->syncBehavioralAnswers($admin, [
            'failure' => [
                'Shipped a migration that locked the orders table for 90 seconds.',
                'Owned it in the incident channel within two minutes.',
                'Added a staging replay step that has caught three since.',
            ],
            'disagreement' => [
                'Tech lead wanted a rewrite; I wanted a strangler migration.',
                'Costed both against the release date on one page.',
                'We strangled it and hit the date with no freeze.',
            ],
            'impact' => [
                'Cut CI from 22 minutes to 6 by splitting the test job.',
                'Deploys per week went from 3 to 15.',
            ],
        ]);

        if ($admin->codingAttempts()->count() === 0) {
            CodingAttempt::factory()->for($admin)->createMany([
                [
                    'title' => 'Debounce an event stream',
                    'difficulty' => 'medium',
                    'topics' => ['concurrency', 'testing'],
                    'completed' => true,
                    'attempted_at' => now()->subDays(6),
                ],
                [
                    'title' => 'Refactor a god object',
                    'difficulty' => 'hard',
                    'topics' => ['refactoring', 'design'],
                    'completed' => false,
                    'attempted_at' => now()->subDays(2),
                ],
            ]);
        }

        if ($admin->aiSessions()->count() === 0) {
            $session = AiSession::factory()->for($admin)->create([
                'kind' => 'coding',
                'system_instruction' => 'You are a senior engineer tutoring a candidate. Ask before you tell.',
                'context' => ['title' => 'Debounce an event stream', 'difficulty' => 'medium'],
                'report' => null,
            ]);

            AiMessage::factory()->for($session, 'session')->createMany([
                ['role' => 'user', 'content' => 'I am stuck on the timer reset.', 'sequence' => 1],
                ['role' => 'model', 'content' => 'What happens to the pending timer when a new event arrives?', 'sequence' => 2],
            ]);
        }
    }

    private function seedMemberData(User $member): void
    {
        Profile::updateOrCreate(['user_id' => $member->id], [
            'base_cv' => "Sam Jobseeker\nJunior Software Engineer\n",
            'cv_file_name' => 'sam-cv.pdf',
            'base_cover_letter' => null,
            'portfolio_url' => 'https://example.test/sam',
            'cover_letter_template' => null,
            'cv_template' => null,
        ]);

        $saved = Application::updateOrCreate(
            ['user_id' => $member->id, 'company' => 'Bluepeak Software'],
            [
                'role' => 'Junior Software Engineer',
                'location' => 'Manchester, UK',
                'url' => 'https://example.test/jobs/bluepeak-junior',
                'status' => JobStatus::Saved,
                'date_applied' => null,
                'notes' => 'Found on the careers page. Needs a tailored CV.',
                'job_description' => 'TypeScript and Node, small product team.',
                'next_action' => 'Tailor the CV and apply',
                'next_action_due' => now()->addDays(2)->toDateString(),
            ],
        );

        $this->syncStatusHistory($saved, [
            [JobStatus::Saved, now()->subDays(3)],
        ]);

        $interviewing = Application::updateOrCreate(
            ['user_id' => $member->id, 'company' => 'Crestline Digital'],
            [
                'role' => 'Software Engineer',
                'location' => 'Hybrid — Leeds',
                'url' => 'https://example.test/jobs/crestline-swe',
                'status' => JobStatus::Interviewing,
                'date_applied' => now()->subDays(14)->toDateString(),
                'notes' => 'Second round booked.',
                'job_description' => 'Full-stack work on a logistics dashboard.',
                'next_action' => 'Prepare STAR stories',
                'next_action_due' => now()->addDays(5)->toDateString(),
                'recruiter_name' => 'Dan Whitfield',
                'recruiter_email' => 'dan@example.test',
                'recruiter_linkedin' => null,
            ],
        );

        $this->syncStatusHistory($interviewing, [
            [JobStatus::Saved, now()->subDays(18)],
            [JobStatus::Applied, now()->subDays(14)],
            [JobStatus::Interviewing, now()->subDays(6)],
        ]);

        $this->syncStages($interviewing, [
            ['phone', now()->subDays(6), 'Intro call with the hiring manager.'],
            ['technical', now()->addDays(5), 'Pair programming, 60 minutes.'],
        ]);

        $this->syncBehavioralAnswers($member, [
            'weakness' => [
                'I over-polish before asking for review.',
                'Now I open a draft PR at the halfway point.',
            ],
            'pressure' => [
                'Two-day turnaround on a client demo build.',
                'Cut scope to the happy path and said so up front.',
                'Demo landed; the client signed.',
            ],
        ]);

        if ($member->codingAttempts()->count() === 0) {
            CodingAttempt::factory()->for($member)->create([
                'title' => 'Parse a config file',
                'difficulty' => 'easy',
                'topics' => ['strings', 'testing'],
                'completed' => true,
                'attempted_at' => now()->subDay(),
            ]);
        }
    }

    /**
     * @param  array<string, list<string>>  $answers  theme id => STAR bullets
     */
    private function syncBehavioralAnswers(User $user, array $answers): void
    {
        foreach ($answers as $themeId => $bullets) {
            BehavioralAnswer::updateOrCreate(
                ['user_id' => $user->id, 'theme_id' => $themeId],
                ['bullets' => $bullets],
            );
        }
    }

    /**
     * @param  list<array{0: JobStatus, 1: Carbon}>  $history
     */
    private function syncStatusHistory(Application $application, array $history): void
    {
        foreach ($history as [$status, $occurredAt]) {
            ApplicationStatusEvent::updateOrCreate(
                ['application_id' => $application->id, 'status' => $status],
                ['occurred_at' => $occurredAt],
            );
        }
    }

    /**
     * @param  list<array{0: string, 1: Carbon, 2: string}>  $stages
     */
    private function syncStages(Application $application, array $stages): void
    {
        foreach ($stages as [$type, $scheduledAt, $notes]) {
            InterviewStage::updateOrCreate(
                ['application_id' => $application->id, 'type' => $type],
                ['scheduled_at' => $scheduledAt, 'notes' => $notes],
            );
        }
    }
}
