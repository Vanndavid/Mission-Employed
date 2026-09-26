<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\AiUsage;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Token usage and estimated cost per user, for the admin screen.
 *
 * Behind auth:sanctum + `admin` like the rest of /admin. Aggregated in SQL
 * with plain SUM/COUNT/MAX so it stays portable off SQLite.
 */
class AdminUsageController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $days = (int) ($request->validate([
            'days' => ['sometimes', 'integer', 'min:1', 'max:365'],
        ])['days'] ?? 30);

        $since = Carbon::now()->subDays($days);

        $window = $this->totals(AiUsage::query()->where('created_at', '>=', $since), ['user_id'])->keyBy('user_id');
        $allTime = $this->totals(AiUsage::query(), ['user_id']);
        $features = $this->totals(AiUsage::query()->where('created_at', '>=', $since), ['user_id', 'feature', 'source'])
            ->groupBy('user_id');

        $users = $allTime
            ->filter(fn ($row) => $row->user_id !== null)
            ->map(fn ($row) => [
                'userId' => (int) $row->user_id,
                'window' => $this->summary($window->get($row->user_id)),
                'allTime' => $this->summary($row),
                'byFeature' => collect($features->get($row->user_id, []))
                    ->map(fn ($feature) => [
                        'feature' => $feature->feature,
                        'source' => $feature->source,
                    ] + $this->summary($feature))
                    ->sortByDesc('totalTokens')
                    ->values()
                    ->all(),
            ])
            ->values();

        return response()->json([
            'days' => $days,
            'since' => $since->toJSON(),
            'users' => $users,
        ]);
    }

    /**
     * @param  Builder<AiUsage>  $query
     * @param  list<string>  $groups
     * @return Collection<int, object>
     */
    private function totals(Builder $query, array $groups): Collection
    {
        return $query
            ->toBase()
            ->select($groups)
            ->selectRaw('COUNT(*) AS calls')
            ->selectRaw('SUM(prompt_tokens) AS prompt_tokens')
            ->selectRaw('SUM(output_tokens) AS output_tokens')
            ->selectRaw('SUM(thought_tokens) AS thought_tokens')
            ->selectRaw('SUM(total_tokens) AS total_tokens')
            ->selectRaw('SUM(cost_micros) AS cost_micros')
            ->selectRaw('SUM(CASE WHEN cost_micros IS NULL THEN 1 ELSE 0 END) AS unpriced_calls')
            ->selectRaw('MAX(created_at) AS last_used_at')
            ->groupBy($groups)
            ->get();
    }

    /** @return array<string, mixed> */
    private function summary(?object $row): array
    {
        return [
            'calls' => (int) ($row->calls ?? 0),
            'promptTokens' => (int) ($row->prompt_tokens ?? 0),
            'outputTokens' => (int) ($row->output_tokens ?? 0),
            'thoughtTokens' => (int) ($row->thought_tokens ?? 0),
            'totalTokens' => (int) ($row->total_tokens ?? 0),
            // Priced calls only; unpricedCalls says how many are missing from it.
            'costUsd' => round((float) ($row->cost_micros ?? 0) / 1_000_000, 6),
            'unpricedCalls' => (int) ($row->unpriced_calls ?? 0),
            'lastUsedAt' => isset($row->last_used_at) ? Carbon::parse($row->last_used_at)->toJSON() : null,
        ];
    }
}
