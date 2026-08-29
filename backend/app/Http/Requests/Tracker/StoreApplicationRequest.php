<?php

namespace App\Http\Requests\Tracker;

use App\Enums\JobStatus;

/**
 * Creating an application. Company and role are the only things the client
 * cannot leave out; everything else has a sensible empty state.
 */
class StoreApplicationRequest extends ApplicationRequest
{
    /** @return array<string, list<string>> */
    public function rules(): array
    {
        return array_merge($this->sharedRules(), [
            'company' => ['required', 'string', 'max:255'],
            'role' => ['required', 'string', 'max:255'],
        ]);
    }

    /**
     * A new application always gets an explicit status so the status event
     * written alongside it has something to record — relying on the column
     * default would leave the in-memory model without one.
     *
     * @return array<string, mixed>
     */
    public function columns(): array
    {
        return array_merge(['status' => JobStatus::Saved->value], parent::columns());
    }
}
