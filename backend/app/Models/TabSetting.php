<?php

namespace App\Models;

use App\Enums\NavTab;
use Database\Factories\TabSettingFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Whether one sidebar tab is hidden from users. Site-wide, not per account or
 * per plan. Rows exist only once an admin has saved the list; {@see hidden()}
 * fills the rest from NavTab's defaults.
 */
class TabSetting extends Model
{
    /** @use HasFactory<TabSettingFactory> */
    use HasFactory;

    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    /** @var list<string> */
    protected $fillable = ['key', 'hidden'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'key' => NavTab::class,
            'hidden' => 'boolean',
        ];
    }

    /**
     * The tabs users do not see, in sidebar order.
     *
     * @return list<string>
     */
    public static function hidden(): array
    {
        $stored = static::query()->pluck('hidden', 'key');

        return array_values(array_map(
            fn (NavTab $tab) => $tab->value,
            array_filter(NavTab::cases(), fn (NavTab $tab) => (bool) ($stored[$tab->value] ?? $tab->defaultHidden())),
        ));
    }

    /**
     * Replace the list: a row for every tab, so the defaults stop applying
     * once an admin has saved it.
     *
     * @param  list<string>  $hidden
     */
    public static function replace(array $hidden): void
    {
        DB::transaction(function () use ($hidden): void {
            foreach (NavTab::cases() as $tab) {
                static::updateOrCreate(['key' => $tab->value], ['hidden' => in_array($tab->value, $hidden, true)]);
            }
        });
    }
}
