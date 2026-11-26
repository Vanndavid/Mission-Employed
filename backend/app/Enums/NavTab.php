<?php

namespace App\Enums;

use App\Models\TabSetting;

/**
 * The sidebar tabs an admin can hide from users. Mirrors NavTabKey in
 * frontend/types/auth.ts; NAV_TABS in frontend/utils/navTabs.ts owns their
 * labels, paths and sidebar order. New cases are added at the end, so the
 * order here is not the sidebar's.
 *
 * A mode is a tab too: Mission Control's Quiz, Code review and System design
 * are drawn as mode tabs on that screen rather than in the sidebar
 * (navTabs.ts says which tab a mode belongs to), and are hidden the same way.
 *
 * Plan & usage, Settings and the admin pages are not here: they cannot be
 * hidden. Hiding a tab declutters the sidebar and nothing more; the features
 * behind it stay governed by the plan ({@see Feature}), so the MCP tools keep
 * working. A tab with no {@see TabSetting} row reads as defaultHidden(), so
 * nothing is seeded.
 */
enum NavTab: string
{
    case MissionControl = 'mission_control';
    case PracticeQuiz = 'practice_quiz';
    case Applications = 'applications';
    case Profile = 'profile';
    case TrainingRoom = 'training_room';
    case MockTest = 'mock_test';
    case PracticeCodeReview = 'practice_code_review';
    case PracticeSystemDesign = 'practice_system_design';

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(fn (self $case) => $case->value, self::cases());
    }

    /** Whether users see it before an admin has saved the tab list. */
    public function defaultHidden(): bool
    {
        return $this === self::TrainingRoom;
    }
}
