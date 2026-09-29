<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The ATS score check (App\Services\Ats\AtsCheck).
     *
     * - ats_keywords caches what the model read out of the job description,
     *   keyed by a hash of the role and description, so re-checking an edited
     *   CV makes no model call.
     * - ats_report is the last check's result, shown in the tracker.
     *
     * JSON for the same reason as rejection_reasons: small, only ever read and
     * written whole, never queried into. Both are written by the server only.
     */
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->json('ats_keywords')->nullable()->after('tailored_cv');
            $table->json('ats_report')->nullable()->after('ats_keywords');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->dropColumn(['ats_keywords', 'ats_report']);
        });
    }
};
