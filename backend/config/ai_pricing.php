<?php

/*
|--------------------------------------------------------------------------
| Gemini prices, for the admin usage screen's cost estimate
|--------------------------------------------------------------------------
|
| USD per 1M tokens, Gemini API standard (paid, non-batch) tier, from
| https://ai.google.dev/gemini-api/docs/pricing as of 2026-09-26. A price per
| million tokens is exactly micro-dollars per token, which is what ai_usage
| stores.
|
| Thinking tokens bill at the text `output` rate. `audio_input` and
| `audio_output` apply to the tokens a reply attributes to the AUDIO
| modality; everything else bills at `input` / `output`.
|
| Recorded costs are fixed when the call is made, so updating a price here
| changes future rows only. A model missing from this list records its tokens
| with no cost, never a zero one. Several of these prices rise on 2027-01-01.
|
*/

return [
    'models' => [
        // Audio input is not listed separately, so it bills as text input.
        'gemini-3.7-flash' => ['input' => 0.75, 'audio_input' => 0.75, 'output' => 3.75],
        'gemini-2.5-flash-preview-tts' => ['input' => 0.50, 'output' => 10.00, 'audio_output' => 10.00],
        'gemini-3.8-live' => ['input' => 0.75, 'audio_input' => 3.00, 'output' => 4.50, 'audio_output' => 12.00],
    ],
];
