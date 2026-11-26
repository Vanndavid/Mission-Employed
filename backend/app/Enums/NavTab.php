<?php

namespace App\Enums;

use App\Models\TabSetting;

/**
 * The sidebar tabs an admin can hide from users, in sidebar order. Mirrors
 * NavTabKey in frontend/types/auth.ts, which owns their labels and paths.
 *
 * A mode is a tab too: Mission Control's Quiz is drawn as a mode tab on that
 * screen rather than in the sidebar (frontend/utils/navTabs.ts says which tab
 * a mode belongs to), and is hidden the same way. A mode comes right after
 * the tab it belongs to.
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
