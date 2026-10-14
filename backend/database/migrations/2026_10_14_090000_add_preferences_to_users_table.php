<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-account UI choices, such as rows per page in the tracker. On the
     * account rather than in localStorage so they follow the user to another
     * device. Null means every default; User::effectivePreferences() fills them in.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->json('preferences')->nullable()->after('deactivated_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('preferences');
        });
    }
};
