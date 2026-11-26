<?php

namespace App\Services\Practice;

/**
 * The seed format for system design: one scenario a file,
 * backend/resources/practice/system_design/<slug>.json, named after its id:
 *
 *     {
 *       "id": "sd-url-shortener",     stable forever: it is external_id
 *       ...the item fields in SystemDesignItemValidator
 *     }
 *
 * {@see SeedBank} hands each file here. A malformed scenario is reported
 * and none of the bank is synced.
 */
final class SystemDesignSeed
{
    /**
     * @param  array<mixed>  $data
     * @param  list<string>  $problems
     * @return list<array<string, mixed>>
     */
    public static function rows(string $file, array $data, array &$problems): array
    {
        $id = $data['id'] ?? null;
        $where = $file.(is_string($id) && $id !== '' ? " ({$id})" : '');

        $item = $data;
        unset($item['id']);
        $errors = SystemDesignItemValidator::errors($item);

        if (! is_string($id) || trim($id) === '') {
            array_unshift($errors, 'needs an id');
        }

        if ($errors !== []) {
            foreach ($errors as $error) {
                $problems[] = "{$where}: {$error}";
            }

            return [];
        }

        return [['external_id' => $id, ...SystemDesignItemValidator::columns($item)]];
    }
}
