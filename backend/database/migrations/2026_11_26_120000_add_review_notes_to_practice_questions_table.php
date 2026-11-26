<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * What the AI said about its own draft, for the admin reviewing it: for
     * the quiz, one line per wrong option on why it is wrong, which is what
     * makes a bad key easy to spot. Shaped per kind, like `answer`, and like
     * `answer` never serialized to a user.
     */
    public function up(): void
    {
        Schema::table('practice_questions', function (Blueprint $table) {
            $table->json('review_notes')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('practice_questions', function (Blueprint $table) {
            $table->dropColumn('review_notes');
        });
    }
};
