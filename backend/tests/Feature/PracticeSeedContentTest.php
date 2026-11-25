<?php

namespace Tests\Feature;

use App\Enums\PracticeLanguage;
use App\Models\PracticeQuestion;
use Tests\TestCase;

/**
 * The hand-written quiz bank in resources/practice/quiz, read straight from
 * the files rather than through the code that syncs them, so a bug there
 * cannot hide a bad question here.
 *
 * A wrong answer key is the worst bug the quiz can have: it marks a right
 * answer wrong and then explains the mistake as if it were true. This cannot
 * prove a key is right, but it catches every way one can be malformed.
 */
class PracticeSeedContentTest extends TestCase
{
    private const MIN_PER_LANGUAGE = 30;

    private const MIN_PER_TOPIC = 5;

    private const REQUIRED = ['id', 'topic', 'difficulty', 'prompt', 'options', 'answer', 'explanation'];

    private const OPTIONAL = ['code'];

    /** @return array<string, array{language: string, questions: list<array<string, mixed>>}> */
    private function files(): array
    {
        $files = [];
        foreach (glob(resource_path('practice/quiz/*.json')) as $path) {
            $data = json_decode((string) file_get_contents($path), true);
            $this->assertIsArray($data, basename($path).' is not valid JSON');
            $files[basename($path, '.json')] = $data;
        }

        return $files;
    }

    public function test_every_launch_language_has_a_file_of_its_own(): void
    {
        $files = $this->files();

        $this->assertEqualsCanonicalizing(PracticeLanguage::values(), array_keys($files));
        foreach ($files as $name => $file) {
            $this->assertSame($name, $file['language'] ?? null, "{$name}.json names another language");
            $this->assertSame(['language', 'questions'], array_keys($file), "{$name}.json has unexpected keys");
        }
    }

    public function test_each_language_has_enough_questions_across_five_to_seven_topics(): void
    {
        foreach ($this->files() as $name => $file) {
            $language = PracticeLanguage::from($name);
            $topics = array_keys($language->topics());

            $this->assertGreaterThanOrEqual(5, count($topics), $name);
            $this->assertLessThanOrEqual(7, count($topics), $name);
            $this->assertGreaterThanOrEqual(self::MIN_PER_LANGUAGE, count($file['questions']), $name);

            $perTopic = array_count_values(array_column($file['questions'], 'topic'));
            foreach ($topics as $topic) {
                $this->assertGreaterThanOrEqual(self::MIN_PER_TOPIC, $perTopic[$topic] ?? 0, "{$name}: {$topic}");
            }
        }
    }

    public function test_every_question_is_well_formed_with_one_right_answer(): void
    {
        $seen = [];

        foreach ($this->files() as $name => $file) {
            $topics = PracticeLanguage::from($name)->topics();

            foreach ($file['questions'] as $i => $q) {
                $where = "{$name}.json #{$i} (".($q['id'] ?? 'no id').')';

                $keys = array_keys($q);
                $this->assertSame([], array_diff(self::REQUIRED, $keys), "{$where} is missing a field");
                $this->assertSame([], array_diff($keys, [...self::REQUIRED, ...self::OPTIONAL]), "{$where} has an unknown field");

                $this->assertIsString($q['id'], $where);
                $this->assertMatchesRegularExpression('/^quiz-[a-z]+-[a-z-]+-\d{2}$/', $q['id'], $where);
                $this->assertArrayNotHasKey($q['id'], $seen, "{$where} reuses an id");
                $seen[$q['id']] = true;

                $this->assertArrayHasKey($q['topic'], $topics, "{$where} has an unknown topic");
                $this->assertContains($q['difficulty'], PracticeQuestion::DIFFICULTIES, $where);
                $this->assertIsString($q['prompt'], $where);
                $this->assertNotSame('', trim($q['prompt']), $where);
                if (array_key_exists('code', $q)) {
                    $this->assertIsString($q['code'], $where);
                    $this->assertNotSame('', trim($q['code']), $where);
                }

                $this->assertIsArray($q['options'], $where);
                $this->assertCount(4, $q['options'], "{$where} needs four options");
                foreach ($q['options'] as $option) {
                    $this->assertIsString($option, $where);
                    $this->assertNotSame('', trim($option), "{$where} has an empty option");
                    $this->assertSame(trim($option), $option, "{$where} has an option with stray spaces");
                }
                $normalised = array_map(fn (string $o) => mb_strtolower($o), $q['options']);
                $this->assertCount(4, array_unique($normalised), "{$where} repeats an option");

                $this->assertIsString($q['answer'], $where);
                $this->assertSame(1, count(array_keys($q['options'], $q['answer'], true)), "{$where}: the answer is not exactly one of the options");

                $this->assertIsString($q['explanation'], $where);
                $this->assertGreaterThan(20, mb_strlen(trim($q['explanation'])), "{$where} needs an explanation");
            }
        }
    }
}
