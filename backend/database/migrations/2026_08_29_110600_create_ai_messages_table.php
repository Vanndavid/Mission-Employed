<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ai_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ai_session_id')->constrained()->cascadeOnDelete();
            // user | model  (Gemini's role vocabulary)
            $table->string('role');
            $table->longText('content');
            $table->unsignedInteger('sequence');
            $table->timestamps();

            $table->index(['ai_session_id', 'sequence']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ai_messages');
    }
};
