<?php

namespace App\Http\Controllers\Auth;

use App\Enums\AccountPlan;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\UpdatePlanRequest;
use App\Models\Plan;
use App\Models\PlanFeature;
use App\Services\Plans\Entitlements;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * The admin's plan editor. Behind auth:sanctum + `admin` like the rest of
 * /admin, so nothing here re-checks the role.
 *
 * The plans themselves are AccountPlan's cases and the features are Feature's:
 * both are code, because code enforces them. What is edited here is their
 * terms, and an edit applies to the next request.
 */
class AdminPlanController extends Controller
{
    public function index(Entitlements $entitlements): JsonResponse
    {
        return response()->json([
            'features' => $entitlements->catalog(),
            'plans' => $entitlements->plans(),
        ]);
    }

    /** Partial: a field or feature left out keeps its current setting. */
    public function update(UpdatePlanRequest $request, AccountPlan $plan, Entitlements $entitlements): JsonResponse
    {
        DB::transaction(function () use ($request, $plan): void {
            Plan::resolve($plan)->fill($request->planAttributes())->save();

            foreach ($request->featureSettings() as $feature => $setting) {
                PlanFeature::updateOrCreate(['plan' => $plan->value, 'feature' => $feature], $setting);
            }
        });

        return response()->json(['plan' => $entitlements->plan($plan)]);
    }
}
