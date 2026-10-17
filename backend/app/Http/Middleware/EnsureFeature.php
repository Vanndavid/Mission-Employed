<?php

namespace App\Http\Middleware;

use App\Enums\AccountPlan;
use App\Enums\Feature;
use App\Models\AiSession;
use App\Models\FeatureUsage;
use App\Services\Plans\Entitlements;
use App\Services\Plans\FeatureSetting;
use Closure;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use LogicException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Gates a route behind a feature of the account's plan, and meters it.
 *
 *     feature:tailored_cv            include the feature, and count one use
 *     feature:tailored_cv,access     include the feature, count nothing
 *     feature:ats_check,deferred     include the feature; the controller calls
 *                                    charge() if and when it does paid work
 *     feature:session                the feature of the route's {session}, by its kind
 *
 * A use is claimed before the paid work and handed back if the response is not
 * a success, so a refused, invalid or failed request costs nothing. Admins pass
 * every gate, but their uses are still counted.
 *
 * The client's PremiumGate is a courtesy; this is the enforcement. Its refusals
 * carry a sentence fit to show as is, because the MCP server relays them
 * verbatim.
 */
class EnsureFeature
{
    private const SETTING = 'feature.setting';

    private const CLAIMED = 'feature.claimed';

    public function __construct(private readonly Entitlements $entitlements) {}

    /**
     * Count this request's use now, on a `deferred` route, because the paid
     * work is about to happen. Answers the request with the 429 instead when
     * the allowance is spent. Counts once however often it is called.
     */
    public static function charge(Request $request): void
    {
        $refusal = app(self::class)->claim($request);

        if ($refusal !== null) {
            throw new HttpResponseException($refusal);
        }
    }

    public function handle(Request $request, Closure $next, string $feature, string $mode = 'meter'): Response
    {
        $user = $request->user();

        // Runs before the controller's own ownership check, so it answers 404
        // itself: a refusal would confirm the session exists, and the feature
        // named in it would say what kind it is.
        $session = $request->route('session');
        abort_if($session instanceof AiSession && $session->user_id !== $user->id, 404, 'Session not found.');

        $feature = $feature === 'session' && $session instanceof AiSession
            ? Feature::forSessionKind($session->kind)
            : Feature::from($feature);

        $setting = $this->entitlements->settingFor($user, $feature);

        if (! $setting->enabled) {
            return $this->refuse($feature, $user->effectivePlan());
        }

        if ($mode === 'access') {
            return $next($request);
        }

        $request->attributes->set(self::SETTING, $setting);

        if ($mode !== 'deferred' && ($refusal = $this->claim($request)) !== null) {
            return $refusal;
        }

        $response = $next($request);

        $usage = $request->attributes->get(self::CLAIMED);

        if ($usage instanceof FeatureUsage && ! $response->isSuccessful()) {
            $usage->delete();
        }

        return $response;
    }

    /** Claim the request's use, or the 429 to answer with. */
    private function claim(Request $request): ?JsonResponse
    {
        $setting = $request->attributes->get(self::SETTING);

        if (! $setting instanceof FeatureSetting) {
            throw new LogicException('charge() needs a route behind feature:<key>,deferred.');
        }

        if ($request->attributes->has(self::CLAIMED)) {
            return null;
        }

        $usage = $this->entitlements->claim($request->user(), $setting);

        if ($usage === null) {
            return $this->quotaExceeded($setting, $request->user()->effectivePlan());
        }

        $request->attributes->set(self::CLAIMED, $usage);

        return null;
    }

    private function refuse(Feature $feature, AccountPlan $plan): JsonResponse
    {
        $upgradeHelps = $plan !== AccountPlan::Premium
            && $this->entitlements->setting(AccountPlan::Premium, $feature)->enabled;

        return response()->json([
            'message' => $upgradeHelps
                ? "{$feature->label()} is a Premium feature."
                : "{$feature->label()} is not available on your plan.",
            // premium_required predates configurable plans; the web client and
            // the MCP server both key their upgrade prompt on it.
            'code' => $upgradeHelps ? 'premium_required' : 'feature_unavailable',
            'feature' => $feature->value,
        ], 403);
    }

    private function quotaExceeded(FeatureSetting $setting, AccountPlan $plan): JsonResponse
    {
        $resetsAt = $setting->period->resetsAt();

        $message = sprintf(
            'You have reached your %s limit (%d per %s). It resets %s UTC.',
            $setting->feature->label(),
            $setting->limit,
            $setting->period->value,
            $resetsAt->format('D j M \a\t H:i'),
        );

        if ($plan !== AccountPlan::Premium) {
            $premium = $this->entitlements->setting(AccountPlan::Premium, $setting->feature);

            if ($setting->isOutdoneBy($premium)) {
                $message .= $premium->limit === null ? ' Premium has no limit.' : ' Premium has a higher limit.';
            }
        }

        return response()->json([
            'message' => $message,
            'code' => 'quota_exceeded',
            'feature' => $setting->feature->value,
            'limit' => $setting->limit,
            'period' => $setting->period->value,
            'resetsAt' => $resetsAt->toIso8601String(),
        ], 429);
    }
}
