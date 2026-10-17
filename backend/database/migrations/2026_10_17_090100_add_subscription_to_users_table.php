<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A Premium plan can end: past plan_expires_at the account reads as Free
     * (User::isPremium()). Null means no end date. premium_requested_at is set
     * by the account's "Request Premium" button and cleared when an admin
     * answers it. Neither is fillable; only their own routes write them.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('plan_expires_at')->nullable()->after('plan');
            $table->timestamp('premium_requested_at')->nullable()->after('plan_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['plan_expires_at', 'premium_requested_at']);
        });
    }
};
