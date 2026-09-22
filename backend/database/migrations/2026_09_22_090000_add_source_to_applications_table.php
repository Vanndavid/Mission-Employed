<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Where the application came from: a job board, a company's own site, a
     * recruiter. Spreadsheet import is the reason it exists — people track a
     * "Channel" column and it was the one field with nowhere to land.
     *
     * Deliberately a free string rather than an enum: the set of job boards is
     * open-ended (Seek, JobsNext, Indeed, whatever launches next month) and an
     * `in:` rule would reject real data on import. The known values are a
     * suggestion list in the client, not a constraint here.
     *
     * No index — nothing filters or sorts on it yet.
     */
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->string('source')->nullable()->after('url');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->dropColumn('source');
        });
    }
};
