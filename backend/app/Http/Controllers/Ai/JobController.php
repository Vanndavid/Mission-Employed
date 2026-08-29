<?php

namespace App\Http\Controllers\Ai;

use App\Http\Requests\Ai\JobParseRequest;
use App\Services\Ai\JobPrompts;
use App\Services\GeminiClient;
use App\Services\GeminiException;
use Illuminate\Http\JsonResponse;

/**
 * Paste a job description, get tracker fields back.
 *
 * Ported from `parseJobApplication`. `analyzeJobDescription` — the criteria
 * scoring that shared the old /ai/job/scan route — is not ported: criteria
 * were cut from the product.
 */
class JobController extends AiController
{
    public function parse(JobParseRequest $request, GeminiClient $gemini): JsonResponse
    {
        $text = $request->string('text')->trim()->value();

        try {
            $parsed = $gemini->generateJson(JobPrompts::parse($text), JobPrompts::parseSchema());
        } catch (GeminiException $exception) {
            return $this->geminiFailure($exception, 'job description parsing');
        }

        $fields = [];

        // The model is free to omit the optional fields, and a blank string is
        // the same as absent to the tracker, which stores nullable columns.
        foreach (JobPrompts::FIELDS as $field) {
            $value = trim($this->text($parsed[$field] ?? null));
            $fields[$field] = $value === '' ? null : $value;
        }

        return response()->json($fields);
    }
}
