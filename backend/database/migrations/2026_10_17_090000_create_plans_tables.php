<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * What each plan includes, as an admin set it, and what each account has
     * used. Both start empty: a plan or feature with no row reads as the
     * defaults in AccountPlan and Feature, so nothing has to be seeded.
     */
    public function up(): void
    {
        // One row per AccountPlan an admin has edited, keyed by its value.
        Schema::create('plans', function (Blueprint $table) {
            $table->string('key', 32)->primary();
            $table->string('name', 60);
            // Free text such as "$9 / month". There is no payment integration.
            $table->string('price_label', 60)->nullable();
            $table->text('description')->nullable();
            // Metered requests per minute, every feature combined. Null: no cap.
            $table->unsignedInteger('requests_per_minute')->nullable();
            $table->timestamps();
        });

        // Per plan and feature: included or not, and how often.
        Schema::create('plan_features', function (Blueprint $table) {
            $table->id();
            $table->string('plan', 32);
            $table->string('feature', 64);
            $table->boolean('enabled');
            // Uses per period. Null: unlimited. Named quota because limit is
            // a reserved word in SQL.
            $table->unsignedInteger('quota')->nullable();
            $table->string('period', 16);
            $table->timestamps();

            $table->unique(['plan', 'feature']);
        });

        // One row per use. Append-only; counted against plan_features.quota.
        Schema::create('feature_usages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('feature', 64);
            $table->timestamp('created_at')->useCurrent();

            $table->index(['user_id', 'feature', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('feature_usages');
        Schema::dropIfExists('plan_features');
        Schema::dropIfExists('plans');
    }
};
