<?php

namespace App\Console\Commands;

use App\Enums\PracticeQuestionSource;
use App\Enums\PracticeQuestionStatus;
use App\Models\PracticeQuestion;
use App\Services\Practice\InvalidSeedBank;
use App\Services\Practice\SeedBank;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Publish the hand-written practice bank (backend/resources/practice).
 *
 * The container entrypoint runs this after `migrate --force` on every boot,
 * so content ships with a deploy, the way BootstrapAdmin reconciles the admin
 * account. It:
 *
 *  - adds a seed question it has not seen, published;
 *  - updates a seed row whose file changed, matched by external_id;
 *  - sets a seed row that has left the files back to draft (its attempts
 *    keep pointing at it, so it is not deleted), and publishes it again if
 *    it comes back;
 *  - never touches a question whose source is ai or admin, even one that
 *    carries a seed's external_id because an admin took it over.
 *
 * Running it twice changes nothing. A bank with any invalid question writes
 * nothing and fails, which fails the boot: a deploy never publishes a
 * malformed answer key.
 */
class SyncPracticeBank extends Command
{
    protected $signature = 'practice:sync';

    protected $description = 'Publish the hand-written practice questions in resources/practice';

    public function handle(SeedBank $bank): int
    {
        try {
            $rows = $bank->load();
        } catch (InvalidSeedBank $invalid) {
            $this->components->error('The practice bank has problems, so nothing was synced:');
            foreach ($invalid->problems as $problem) {
                $this->line("  - {$problem}");
            }

            return self::FAILURE;
        }

        $added = $updated = $retired = 0;

        DB::transaction(function () use ($rows, &$added, &$updated, &$retired): void {
            $existing = PracticeQuestion::query()->whereNotNull('external_id')->get()->keyBy('external_id');

            foreach ($rows as $externalId => $row) {
                $question = $existing->get($externalId);

                if ($question !== null && $question->source !== PracticeQuestionSource::Seed) {
                    continue;
                }

                $question ??= new PracticeQuestion;
                $question->fill([
                    ...$row,
                    'status' => PracticeQuestionStatus::Published,
                    'source' => PracticeQuestionSource::Seed,
                ]);

                if (! $question->exists) {
                    $question->save();
                    $added++;
                } elseif ($question->isDirty()) {
                    $question->save();
                    $updated++;
                }
            }

            $gone = PracticeQuestion::query()
                ->where('source', PracticeQuestionSource::Seed)
                ->where('status', PracticeQuestionStatus::Published)
                ->get()
                ->reject(fn (PracticeQuestion $q) => $q->external_id !== null && isset($rows[$q->external_id]));

            foreach ($gone as $question) {
                $question->update(['status' => PracticeQuestionStatus::Draft]);
                $retired++;
            }
        });

        $this->components->info("Practice bank: {$added} added, {$updated} updated, {$retired} retired.");

        return self::SUCCESS;
    }
}
