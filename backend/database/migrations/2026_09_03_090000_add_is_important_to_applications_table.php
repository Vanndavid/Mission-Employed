<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Starring an application. The tracker table pins starred rows to the top
     * and can filter down to them, so this is read on every list request —
     * hence the composite index alongside the existing (user_id, status) one.
     */
    public function up(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->boolean('is_important')->default(false)->after('status');

            $table->index(['user_id', 'is_important']);
        });
    }

    public function down(): void
    {
        Schema::table('applications', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'is_important']);
            $table->dropColumn('is_important');
        });
    }
};
