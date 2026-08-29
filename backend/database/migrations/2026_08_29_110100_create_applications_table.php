<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('applications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('company');
            $table->string('role');
            $table->string('location')->nullable();
            $table->string('url')->nullable();
            // App\Enums\JobStatus: Saved | Applied | Interviewing | Offer | Rejected
            $table->string('status')->default('Saved');
            $table->date('date_applied')->nullable();
            $table->text('notes')->nullable();
            $table->longText('job_description')->nullable();
            $table->longText('cover_letter')->nullable();
            $table->longText('tailored_cv')->nullable();
            $table->string('next_action')->nullable();
            $table->date('next_action_due')->nullable();
            // Flattened from the frontend's RecruiterContact object.
            $table->string('recruiter_name')->nullable();
            $table->string('recruiter_email')->nullable();
            $table->string('recruiter_linkedin')->nullable();
            // Plain tracker payloads: { base, equity, benefits, startDate } and
            // { deadline, repo, status }. No separate offer-tools feature.
            $table->json('offer')->nullable();
            $table->json('take_home')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('applications');
    }
};
