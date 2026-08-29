<?php

namespace App\Http\Controllers;

use App\Http\Requests\Tracker\UpdateProfileRequest;
use App\Http\Resources\ProfileResource;
use App\Models\Profile;
use Illuminate\Http\Request;

/**
 * The signed-in user's CV, cover letter and templates. There is exactly one
 * profile per user and registration creates it, so neither endpoint takes an
 * id — the token identifies the row.
 */
class ProfileController extends Controller
{
    public function show(Request $request): ProfileResource
    {
        return new ProfileResource($this->profileFor($request));
    }

    public function update(UpdateProfileRequest $request): ProfileResource
    {
        $profile = $this->profileFor($request);

        $profile->fill($request->columns())->save();

        return new ProfileResource($profile);
    }

    /**
     * AuthController creates a profile on registration; firstOrCreate is the
     * safety net for accounts that predate it, not the normal path.
     */
    private function profileFor(Request $request): Profile
    {
        return $request->user()->profile()->firstOrCreate([]);
    }
}
