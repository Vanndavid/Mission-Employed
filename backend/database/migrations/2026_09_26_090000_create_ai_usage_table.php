<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per Gemini call made on a user's behalf, for the admin usage
        // screen. Append-only, so there is no updated_at.
        Schema::create('ai_usage', function (Blueprint $table) {
            $table->id();
            // Nullable: a call outside a request (a console command) has no user.
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            // The route pattern, e.g. ai/mock/sessions/{session}/report.
            $table->string('feature');
            $table->string('model');
            // server: seen by GeminiService, exact. live: reported by the browser.
            $table->string('source', 16)->default('server');
            $table->unsignedInteger('prompt_tokens')->default(0);
            $table->unsignedInteger('output_tokens')->default(0);
            $table->unsignedInteger('thought_tokens')->default(0);
            $table->unsignedInteger('total_tokens')->default(0);
            // Estimated USD in millionths, priced when recorded so a later
            // price change does not rewrite history. Null when the model has
            // no known price, which is not the same as free.
            $table->double('cost_micros')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['user_id', 'created_at']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_usage');
    }
};
