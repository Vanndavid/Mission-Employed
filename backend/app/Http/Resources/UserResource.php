<?php

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The client-facing shape of a user, matching AuthUser in
 * frontend/types/auth.ts: id, email, role, plan, createdAt.
 *
 * The password hash is never a key here — this resource, not $hidden, is the
 * only thing that decides what a user serializes to.
 *
 * `plan` is the *effective* plan, so an admin always reads back as premium even
 * when the stored plan is free. That mirrors publicUser() in the retired
 * server/usersStore.js and keeps the client's isPremiumUser() honest.
 *
 * @mixin User
 */
class UserResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'role' => $this->role->value,
            'plan' => $this->effectivePlan()->value,
            'createdAt' => $this->created_at?->toIso8601String(),
        ];
    }
}
