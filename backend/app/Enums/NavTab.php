<?php

namespace App\Enums;

use App\Models\TabSetting;

/**
 * The sidebar tabs an admin can hide from users, in sidebar order. Mirrors
 * NavTabKey in frontend/types/auth.ts, which owns their labels and paths.
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
    case Applications = 'applications';
    case Profile = 'profile';
    case TrainingRoom = 'training_room';
    case MockTest = 'mock_test';

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
