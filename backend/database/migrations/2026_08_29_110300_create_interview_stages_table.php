<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('interview_stages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('application_id')->constrained()->cascadeOnDelete();
            // phone | technical | system_design | behavioral | onsite | take_home
            $table->string('type');
            $table->timestamp('scheduled_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['application_id', 'scheduled_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('interview_stages');
    }
};
