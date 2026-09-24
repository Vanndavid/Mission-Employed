<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Unauthenticated liveness check, read by deploy.sh (rollback on failure) and
 * by the scheduled uptime workflow (.github/workflows/uptime.yml). Any failing
 * check turns the whole response into a 503, so both of them see it as down.
 * Failure detail goes to the log, never into the response.
 */
class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $checks = [
            'database' => $this->check('database', fn () => DB::select('select 1')),
            'storage' => $this->check('storage', function () {
                $disk = Storage::disk('local');
                $disk->put('.health', (string) time());
                $disk->delete('.health');
            }),
        ];

        $healthy = ! in_array('failing', $checks, true);

        return response()->json(
            ['status' => $healthy ? 'ok' : 'failing', 'checks' => $checks],
            $healthy ? 200 : 503,
        );
    }

    private function check(string $name, callable $probe): string
    {
        try {
            $probe();

            return 'ok';
        } catch (Throwable $e) {
            Log::error("Health check failed: {$name}", ['exception' => $e]);

            return 'failing';
        }
    }
}
