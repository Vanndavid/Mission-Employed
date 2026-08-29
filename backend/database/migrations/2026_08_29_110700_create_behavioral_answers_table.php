<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('behavioral_answers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Stable client-side theme id from BEHAVIORAL_THEMES in
            // frontend/constants.ts: weakness | challenge | failure |
            // disagreement | pressure | impact.
            $table->string('theme_id');
            // STAR-style bullets, a list of strings.
            $table->json('bullets');
            $table->timestamps();

            // One answer set per theme per user — the PrepRoom edits in place.
            $table->unique(['user_id', 'theme_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('behavioral_answers');
    }
};
