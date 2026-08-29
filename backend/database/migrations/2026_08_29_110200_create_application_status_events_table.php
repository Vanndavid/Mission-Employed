<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('application_status_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('application_id')->constrained()->cascadeOnDelete();
            // App\Enums\JobStatus value the application moved into.
            $table->string('status');
            $table->timestamp('occurred_at');
            $table->timestamps();

            $table->index(['application_id', 'occurred_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('application_status_events');
    }
};
