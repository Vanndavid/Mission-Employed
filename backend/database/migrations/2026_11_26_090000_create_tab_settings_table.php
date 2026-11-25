<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Which sidebar tabs users see, one row per NavTab an admin has saved. A
     * tab with no row reads as NavTab::defaultHidden(), so nothing is seeded.
     */
    public function up(): void
    {
        Schema::create('tab_settings', function (Blueprint $table) {
            $table->string('key', 32)->primary();
            $table->boolean('hidden');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tab_settings');
    }
};
