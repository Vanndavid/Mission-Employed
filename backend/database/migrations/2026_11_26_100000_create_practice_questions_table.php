<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One bank for every practice mode that serves questions: the quiz now,
     * code review and system design later (PracticeKind). Hand-written
     * questions arrive through `practice:sync`, keyed by external_id.
     */
    public function up(): void
    {
        Schema::create('practice_questions', function (Blueprint $table) {
            $table->id();
            // PracticeKind: quiz | code_review | system_design
            $table->string('kind', 32);
            // PracticeLanguage; null for a mode with no language (system design).
            $table->string('language', 32)->nullable();
            // A key from PracticeLanguage::topics() for a language's questions.
            $table->string('topic', 64);
            // easy | medium | hard
            $table->string('difficulty', 16);
            $table->text('prompt');
            // The snippet the question is about, if any.
            $table->text('code')->nullable();
            // The quiz's four choices; null for a mode without choices.
            $table->json('options')->nullable();
            // The key, shaped per kind: {"choice": "..."} for the quiz. Never
            // serialized to a user before they have answered.
            $table->json('answer');
            $table->text('explanation');
            // PracticeQuestionStatus: draft | published
            $table->string('status', 16)->default('draft');
            // PracticeQuestionSource: seed | ai | admin
            $table->string('source', 16);
            // The stable id of seeded content; null for everything else.
            $table->string('external_id', 128)->nullable()->unique();
            $table->timestamps();

            $table->index(['kind', 'status', 'language', 'topic']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practice_questions');
    }
};
