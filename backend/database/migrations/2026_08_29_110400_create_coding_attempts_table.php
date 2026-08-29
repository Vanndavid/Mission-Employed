<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coding_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            // easy | medium | hard
            $table->string('difficulty');
            $table->json('topics')->nullable();
            $table->boolean('completed')->default(false);
            $table->timestamp('attempted_at');
            $table->timestamps();

            $table->index(['user_id', 'attempted_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('coding_attempts');
    }
};
