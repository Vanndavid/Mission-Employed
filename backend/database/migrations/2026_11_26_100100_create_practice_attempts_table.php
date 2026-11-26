<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Every answer to a practice_questions row, append-only. Progress, open
     * mistakes and what to serve next are all worked out from here, so they
     * follow the account rather than living in a browser. coding_attempts
     * stays separate: it is the AI tutor's history and has no question row.
     */
    public function up(): void
    {
        Schema::create('practice_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('practice_question_id')->constrained()->cascadeOnDelete();
            // The question's PracticeKind, copied so history reads by kind without a join.
            $table->string('kind', 32);
            // What the user sent: {"choice": "..." | null} for the quiz.
            $table->json('response');
            $table->unsignedInteger('score');
            $table->unsignedInteger('max_score');
            // Right or wrong where that is a yes/no; null for a scored essay.
            $table->boolean('correct')->nullable();
            // Per-kind detail of how it was scored; null for the quiz.
            $table->json('feedback')->nullable();
            // Which rubric an AI-judged score was given against.
            $table->string('rubric_version', 32)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['user_id', 'kind', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practice_attempts');
    }
};
