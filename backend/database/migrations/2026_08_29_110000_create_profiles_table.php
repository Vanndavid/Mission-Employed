<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->longText('base_cv')->nullable();
            $table->string('cv_file_name')->nullable();
            $table->longText('base_cover_letter')->nullable();
            $table->string('portfolio_url')->nullable();
            $table->longText('cover_letter_template')->nullable();
            $table->longText('cv_template')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('profiles');
    }
};
