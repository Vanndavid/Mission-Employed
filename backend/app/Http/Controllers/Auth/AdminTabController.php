<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\UpdateHiddenTabsRequest;
use App\Models\TabSetting;
use Illuminate\Http\JsonResponse;

/**
 * Which sidebar tabs users see. Behind auth:sanctum + `admin` like the rest of
 * /admin. Reading needs no endpoint of its own: the list comes with the
 * session payloads in AuthController.
 */
class AdminTabController extends Controller
{
    public function update(UpdateHiddenTabsRequest $request): JsonResponse
    {
        TabSetting::replace($request->hiddenTabs());

        return response()->json(['hiddenTabs' => TabSetting::hidden()]);
    }
}
