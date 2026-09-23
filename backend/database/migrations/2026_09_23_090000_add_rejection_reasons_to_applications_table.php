<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Why an application was turned down, as a list of short reasons. Seek's
     * "unlikely to progress" email names the screening questions whose answers
     * did not match the employer's preferences (right to work, years of
     * experience), and those land here via the MCP email sync.
     *
     * JSON rather than a child table: the list is small, only ever read and
     * written whole, and nothing queries into it.
     */
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->json('rejection_reasons')->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->dropColumn('rejection_reasons');
        });
    }
};
