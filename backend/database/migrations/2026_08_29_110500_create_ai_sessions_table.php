<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // coding | behavioral | mock | cover_letter | cv
            $table->string('kind');
            $table->text('system_instruction');
            $table->json('context')->nullable();
            $table->json('report')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'kind']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_sessions');
    }
};
