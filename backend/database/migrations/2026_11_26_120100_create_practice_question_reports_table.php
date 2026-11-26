<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A user saying a question is wrong. One row per user per question: a
     * second report while it is open is refused, and one after an admin
     * resolved it reopens the row with the new reason.
     */
    public function up(): void
    {
        Schema::create('practice_question_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('practice_question_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('reason');
            // Null while open; set when an admin resolves the question's reports.
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->unique(['practice_question_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('practice_question_reports');
    }
};
