/**
 * VideoUnderstanding - Gemini-based structured video content analysis
 *
 * This module implements Module 3 of the CrowdListen video pipeline.
 * It uploads a local video file to the Gemini Files API, waits for processing,
 * then sends the video to Gemini 2.5 Flash with a structured "understand the video"
 * prompt that returns rich JSON — including a timestamped timeline and key moments.
 *
 * The resulting VideoContext is consumed downstream by:
 *   - CommentEnricher  (resolves coreference/reference in comments)
 *   - CommentClustering (uses enriched comments for better semantic clusters)
 *
 * Pipeline position:
 *   VideoDownloader → [VideoUnderstanding] → CommentEnricher → CommentClustering
 */

import { GoogleGenerativeAI, SchemaType, type Schema } from '@google/generative-ai';
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server';
import * as fs from 'fs';
import * as path from 'path';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * A single segment in the video timeline.
 * Segments cover the full video duration and are used to anchor comment
 * references to specific time ranges ("that part at the beginning", etc.).
 */
export interface TimelineSegment {
  start: string;       // e.g. "0:00"
  end: string;         // e.g. "0:15"
  description: string; // What happens in this segment
}

/**
 * A specific notable moment in the video, with a precise timestamp.
 * Key moments are the primary anchors for resolving comment references like
 * "when she did that", "that part was hilarious", "0:45 🔥", etc.
 */
export interface KeyMoment {
  timestamp: string;   // e.g. "0:23"
  description: string; // What happens — written to be self-explanatory
}

/**
 * Structured understanding of a video, produced by Gemini 2.5 Flash.
 * This is the central data structure passed through the enrichment pipeline.
 */
export interface VideoContext {
  /** Core subject of the video in one sentence. */
  mainTopic: string;

  /** 3–5 sentence narrative description covering the full video. */
  summary: string;

  /**
   * Named entities that appear in the video.
   * Critical for resolving pronouns: "she", "he", "it", "they" → specific entities.
   */
  keyEntities: {
    people: string[];    // Named or described people ("the host", "woman in red jacket")
    objects: string[];   // Key props or products central to the content
    locations: string[]; // Settings or locations shown
  };

  /**
   * Chronological coverage of the full video, in 10–30 second segments.
   * Enables resolution of temporal references: "that part at the end", "the intro", etc.
   */
  timeline: TimelineSegment[];

  /**
   * 3–8 specific timestamps where something notable happens.
   * These are the primary reference anchors for comment enrichment —
   * reviewers commonly refer to these moments without naming them explicitly.
   */
  keyMoments: KeyMoment[];

  /** Overall tone/atmosphere: "humorous", "informative", "emotional", "confrontational", etc. */
  mood: string;

  /**
   * Background knowledge a commenter might assume but the video does not state.
   * Examples: creator backstory, trending context, ongoing controversy references.
   */
  implicitContext: string[];

  /** How this video relates to the keyword that was used to find it. */
  searchKeywordRelevance: string;

  /**
   * Chronological, high-signal excerpt of the most comment-relevant spoken
   * dialogue and voiceover narration. Preserves wording for key lines without
   * trying to be an exhaustive transcript of every filler phrase.
   */
  transcript: string;

  /**
   * Salient on-screen text anchors that add meaning beyond the audio:
   * titles, step labels, ingredient cards, warnings, claims, and CTAs.
   * Deduplicated and filtered to avoid OCR-style dumps of repeated subtitles/UI.
   */
  visualText: string[];

  /**
   * Background music or notable sound effects.
   * Includes song name/artist if identifiable, otherwise describes genre/mood.
   * Comments commonly reference audio: "this song", "the beat", "that sound".
   */
  audioTrack: string;

  /**
   * Explicit calls-to-action made in the video
   * (e.g. "comment below", "like if you agree", "tell me your answer").
   * These directly shape comment patterns and explain engagement spikes.
   */
  callsToAction: string[];

  /**
   * How the emotional tone/energy shifts across the video's duration.
   * E.g. "starts playful → builds tension at 0:20 → ends triumphantly at 0:40".
   * Helps cluster comments by which part of the video triggered the reaction.
   */
  emotionalArc: string;

  /**
   * Specific moments likely to provoke debate or divided reactions.
   * Different from keyMoments — focused on opinion-splitting content that
   * explains why certain comment threads get heated or polarised.
   */
  controversialMoments: KeyMoment[];

  // Processing metadata — not part of semantic content
  videoId: string;
  processingTimeMs: number;
}

// ─── Internal constants ───────────────────────────────────────────────────────

/**
 * Gemini model for video understanding.
 * gemini-2.5-flash delivers excellent structured extraction quality at low cost.
 * Switch to gemini-2.5-pro for maximum quality on complex or long-form videos.
 */
const GEMINI_MODEL = 'gemini-2.5-flash';

const TIMELINE_SEGMENT_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    start: { type: SchemaType.STRING },
    end: { type: SchemaType.STRING },
    description: { type: SchemaType.STRING },
  },
  required: ['start', 'end', 'description'],
} satisfies Schema;

const KEY_MOMENT_SCHEMA = {
  type: SchemaType.OBJECT,
  properties: {
    timestamp: { type: SchemaType.STRING },
    description: { type: SchemaType.STRING },
  },
  required: ['timestamp', 'description'],
} satisfies Schema;

const FULL_VISUAL_TEXT_LIMIT = 30;
const COMPACT_VISUAL_TEXT_LIMIT = 15;
const COMPACT_TIMELINE_SEGMENT_LIMIT = 12;
const COMPACT_KEY_MOMENT_LIMIT = 10;
const COMPACT_IMPLICIT_CONTEXT_LIMIT = 8;
const COMPACT_CALLS_TO_ACTION_LIMIT = 6;
const COMPACT_CONTROVERSIAL_MOMENT_LIMIT = 5;
const FULL_TRANSCRIPT_CHAR_TARGET = 6500;
const COMPACT_TRANSCRIPT_CHAR_LIMIT = 4000;

type GenerationMode = 'full' | 'compact';

function createStringArraySchema(maxItems?: number): Schema {
  return {
    type: SchemaType.ARRAY,
    items: { type: SchemaType.STRING },
    ...(maxItems !== undefined ? { maxItems } : {}),
  } satisfies Schema;
}

function createVideoContextResponseSchema(mode: GenerationMode): Schema {
  const isCompact = mode === 'compact';

  return {
    type: SchemaType.OBJECT,
    properties: {
      mainTopic: { type: SchemaType.STRING },
      summary: { type: SchemaType.STRING },
      keyEntities: {
        type: SchemaType.OBJECT,
        properties: {
          people: createStringArraySchema(),
          objects: createStringArraySchema(),
          locations: createStringArraySchema(),
        },
        required: ['people', 'objects', 'locations'],
      },
      timeline: {
        type: SchemaType.ARRAY,
        items: TIMELINE_SEGMENT_SCHEMA,
        ...(isCompact ? { maxItems: COMPACT_TIMELINE_SEGMENT_LIMIT } : {}),
      },
      keyMoments: {
        type: SchemaType.ARRAY,
        items: KEY_MOMENT_SCHEMA,
        ...(isCompact ? { maxItems: COMPACT_KEY_MOMENT_LIMIT } : {}),
      },
      mood: { type: SchemaType.STRING },
      implicitContext: createStringArraySchema(
        isCompact ? COMPACT_IMPLICIT_CONTEXT_LIMIT : undefined
      ),
      searchKeywordRelevance: { type: SchemaType.STRING },
      transcript: { type: SchemaType.STRING },
      visualText: createStringArraySchema(
        isCompact ? COMPACT_VISUAL_TEXT_LIMIT : FULL_VISUAL_TEXT_LIMIT
      ),
      audioTrack: { type: SchemaType.STRING },
      callsToAction: createStringArraySchema(
        isCompact ? COMPACT_CALLS_TO_ACTION_LIMIT : undefined
      ),
      emotionalArc: { type: SchemaType.STRING },
      controversialMoments: {
        type: SchemaType.ARRAY,
        items: KEY_MOMENT_SCHEMA,
        ...(isCompact ? { maxItems: COMPACT_CONTROVERSIAL_MOMENT_LIMIT } : {}),
      },
    },
    required: [
      'mainTopic',
      'summary',
      'keyEntities',
      'timeline',
      'keyMoments',
      'mood',
      'implicitContext',
      'searchKeywordRelevance',
      'transcript',
      'visualText',
      'audioTrack',
      'callsToAction',
      'emotionalArc',
      'controversialMoments',
    ],
  } satisfies Schema;
}

const VIDEO_CONTEXT_RESPONSE_SCHEMA = createVideoContextResponseSchema('full');
const COMPACT_VIDEO_CONTEXT_RESPONSE_SCHEMA = createVideoContextResponseSchema('compact');

/** Interval between file-state polling requests (ms). */
const POLLING_INTERVAL_MS = 3000;

/**
 * Maximum number of polling attempts before timing out.
 * 40 attempts × 3 s = 2 minutes maximum wait.
 */
const MAX_POLL_ATTEMPTS = 40;

/**
 * Timeout for the Gemini generateContent call (ms).
 * Gemini 2.5 Flash is a thinking model and can take several minutes on
 * longer videos. Without a timeout the SDK waits indefinitely.
 * 5 minutes should be sufficient for videos up to ~5 min long.
 */
const GENERATE_TIMEOUT_MS = 300_000; // 5 minutes
const REPAIR_TIMEOUT_MS = 60_000;
const MAX_GENERATION_ATTEMPTS = 2;
const MALFORMED_RESPONSE_DIR = '/tmp/crowdlisten_gemini_failures';

interface JsonParseAttempt {
  parsed?: any;
  error?: unknown;
}

class MaxTokensError extends Error {
  constructor(
    public readonly fileUri: string,
    public readonly mode: GenerationMode
  ) {
    super(`Gemini output truncated (MAX_TOKENS) for ${fileUri}`);
    this.name = 'MaxTokensError';
  }
}

// ─── Service class ────────────────────────────────────────────────────────────

export class VideoUnderstandingService {
  private readonly genAI: GoogleGenerativeAI;
  private readonly fileManager: GoogleAIFileManager;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required for video understanding');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.fileManager = new GoogleAIFileManager(apiKey);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Analyze a local video file and return structured VideoContext.
   *
   * This is the single public entry point for video understanding.
   * Internally it: uploads the file → polls until ready → runs the prompt → parses JSON.
   *
   * @param videoFilePath  Absolute path to the downloaded video file (.mp4, .webm, etc.)
   * @param videoId        Platform video ID, used in metadata and logs
   * @param searchKeyword  The keyword used to discover this video; improves Gemini's analysis
   *                       by providing topic context (optional)
   */
  async understandVideo(
    videoFilePath: string,
    videoId: string,
    searchKeyword: string = ''
  ): Promise<VideoContext> {
    const startTime = Date.now();

    if (!fs.existsSync(videoFilePath)) {
      throw new Error(`Video file not found at path: ${videoFilePath}`);
    }

    console.log(`[VideoUnderstanding] Starting analysis — videoId: ${videoId}`);

    // Step 1: Upload the video file to Gemini Files API and wait until ready
    const fileUri = await this.uploadAndWait(videoFilePath, videoId);

    // Step 2: Ask Gemini 2.5 Flash Pro to understand the video
    const context = await this.generateContextWithRecovery(
      fileUri,
      videoId,
      searchKeyword,
      startTime
    );

    console.log(
      `[VideoUnderstanding] Done — videoId: ${videoId}, ` +
      `took ${context.processingTimeMs}ms, ` +
      `${context.keyMoments.length} key moments, ` +
      `${context.timeline.length} timeline segments`
    );

    return context;
  }

  // ─── Private: upload ──────────────────────────────────────────────────────

  /**
   * Upload a video file to Gemini Files API, then poll until it reaches
   * the ACTIVE state (meaning Gemini has finished processing it).
   *
   * Gemini requires uploaded files to finish server-side processing before
   * they can be referenced in generateContent calls.
   *
   * @returns The file URI to use in generateContent's fileData field
   */
  private async uploadAndWait(filePath: string, videoId: string): Promise<string> {
    const mimeType = this.inferMimeType(filePath);
    const displayName = `crowdlisten_${videoId}_${Date.now()}`;

    console.log(`[VideoUnderstanding] Uploading to Gemini Files API (${mimeType})...`);

    const uploadResult = await this.fileManager.uploadFile(filePath, {
      mimeType,
      displayName,
    });

    const fileUri = uploadResult.file.uri;
    const fileName = uploadResult.file.name;

    console.log(`[VideoUnderstanding] Upload complete. Waiting for processing...`);

    // Poll until the file moves from PROCESSING → ACTIVE
    await this.pollUntilActive(fileName);

    return fileUri;
  }

  /**
   * Repeatedly check the file's state until it becomes ACTIVE (ready) or FAILED.
   * Throws if the file fails or if we exceed MAX_POLL_ATTEMPTS.
   */
  private async pollUntilActive(fileName: string): Promise<void> {
    for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
      const file = await this.fileManager.getFile(fileName);

      if (file.state === FileState.ACTIVE) {
        console.log(`[VideoUnderstanding] File is ACTIVE after ${attempt} poll(s)`);
        return;
      }

      if (file.state === FileState.FAILED) {
        throw new Error(
          `Gemini file processing FAILED for: ${fileName}. ` +
          `Check that the video file is not corrupted.`
        );
      }

      // Still PROCESSING — wait before the next check
      console.log(
        `[VideoUnderstanding] Still processing... ` +
        `(attempt ${attempt}/${MAX_POLL_ATTEMPTS}, waiting ${POLLING_INTERVAL_MS}ms)`
      );
      await this.sleep(POLLING_INTERVAL_MS);
    }

    throw new Error(
      `Gemini file processing timed out after ` +
      `${(MAX_POLL_ATTEMPTS * POLLING_INTERVAL_MS) / 1000}s`
    );
  }

  // ─── Private: generation ─────────────────────────────────────────────────

  /**
   * Send the uploaded video (referenced by URI) to Gemini 2.5 Flash with
   * the structured understanding prompt. Returns the raw response string.
   *
   * The prompt instructs Gemini to return only JSON — no markdown, no prose.
   * We strip any accidental code fences before returning.
   */
  private async runUnderstandingPrompt(
    fileUri: string,
    searchKeyword: string,
    attempt: number = 1,
    mode: GenerationMode = 'full'
  ): Promise<string> {
    const model = this.getStructuredModel(mode);
    const prompt = this.buildPrompt(searchKeyword, attempt, mode);

    const result = await model.generateContent(
      [
        {
          // Reference the uploaded video file by its Gemini Files URI
          fileData: {
            fileUri,
            mimeType: 'video/mp4',
          },
        },
        { text: prompt },
      ],
      { timeout: GENERATE_TIMEOUT_MS },
    );

    // Detect truncation early — if MAX_TOKENS was hit the JSON will be incomplete.
    const finishReason = result.response.candidates?.[0]?.finishReason;
    if (finishReason === 'MAX_TOKENS') {
      throw new MaxTokensError(fileUri, mode);
    }

    // With JSON mode enabled, Gemini returns raw JSON (no code fences).
    // Strip fences anyway as a belt-and-suspenders fallback.
    return this.cleanJsonResponseText(result.response.text());
  }

  /**
   * Build the structured "understand the video" prompt sent to Gemini.
   *
   * Design rationale:
   * - keyMoments and timeline are the most critical fields — they provide
   *   the factual anchors needed to resolve comment references like
   *   "that part", "when she did that", "0:45 was insane", etc.
   * - keyEntities.people enables pronoun resolution: "she/he/they" → specific person.
   * - implicitContext captures background knowledge that commenters might assume
   *   but the video does not explicitly state (creator lore, trending context, etc.).
   * - All output is English, matching the downstream embedding model's language.
   *
   * @param searchKeyword  Used to add a relevance-mapping field to the output
   */
  private buildPrompt(
    searchKeyword: string,
    attempt: number = 1,
    mode: GenerationMode = 'full'
  ): string {
    const transcriptTarget = mode === 'compact'
      ? COMPACT_TRANSCRIPT_CHAR_LIMIT
      : FULL_TRANSCRIPT_CHAR_TARGET;
    const visualTextLimit = mode === 'compact'
      ? COMPACT_VISUAL_TEXT_LIMIT
      : FULL_VISUAL_TEXT_LIMIT;

    // Only include the searchKeywordRelevance field if a keyword was provided
    const relevanceField = searchKeyword
      ? `  "searchKeywordRelevance": "How this video relates to the search keyword '${searchKeyword}' (1-2 sentences)",`
      : `  "searchKeywordRelevance": "",`;
    const retryNotice = attempt > 1 && mode === 'full'
      ? `

CRITICAL:
- The previous attempt failed because the output was not valid JSON.
- Every double quote inside string values must be escaped.
- If you are unsure about a field, use an empty string "" or empty array [].
- Do not include any commentary before or after the JSON object.`
      : '';
    const compactModeNotice = mode === 'compact'
      ? `

CRITICAL OUTPUT BUDGET:
- Keep the JSON compact and concise so it fits comfortably within the model's output limit.
- transcript: include the most comment-relevant spoken content only; if the full transcript would be long, truncate at about ${COMPACT_TRANSCRIPT_CHAR_LIMIT} characters and append " [truncated]".
- visualText: include at most ${COMPACT_VISUAL_TEXT_LIMIT} unique, salient text anchors; deduplicate near-identical text.
- timeline: use no more than ${COMPACT_TIMELINE_SEGMENT_LIMIT} segments.
- keyMoments: use no more than ${COMPACT_KEY_MOMENT_LIMIT} moments.
- controversialMoments: use no more than ${COMPACT_CONTROVERSIAL_MOMENT_LIMIT} moments.
- Prefer preserving the most useful details for comment understanding over exhaustive completeness.`
      : '';

    return `You are a video content analysis assistant. Watch this entire video carefully, including all audio.

Return ONLY the following JSON object — no extra text, no markdown, no explanation:

{
  "mainTopic": "The core subject of the video in one sentence",
  "summary": "3-5 sentence narrative of what happens from start to finish",
  "keyEntities": {
    "people": ["Each person who appears, named or described — e.g. 'the male host', 'woman in red jacket', 'interviewer'"],
    "objects": ["Key props, products, or items central to the content"],
    "locations": ["Settings or locations shown in the video"]
  },
  "timeline": [
    {
      "start": "0:00",
      "end": "0:15",
      "description": "What happens in this time segment — be specific"
    }
  ],
  "keyMoments": [
    {
      "timestamp": "0:23",
      "description": "A specific notable moment — a reaction, surprise, punchline, key action, or emotional beat. Write it so the description alone identifies the moment without needing to watch."
    }
  ],
  "mood": "Overall tone/atmosphere of the video (e.g. 'humorous', 'informative', 'emotional', 'confrontational', 'inspirational')",
  "implicitContext": [
    "Background knowledge a commenter might assume but the video does not state. E.g. 'Creator is known for X', 'This references trending topic Y', 'Sequel to a previous video about Z'"
  ],
${relevanceField}
  "transcript": "Chronological high-signal excerpt of the most comment-relevant spoken lines and voiceover narration. Preserve original wording for key quotes, instructions, claims, jokes, and calls-to-action; do not try to include every filler phrase. Empty string if no speech.",
  "visualText": ["High-signal on-screen text anchors that add meaning beyond the audio — titles, step labels, ingredient labels, warnings, claims, and calls-to-action. Deduplicate repeated text and exclude watermarks, usernames, platform UI, and subtitle fragments that simply mirror the transcript."],
  "audioTrack": "Background music or notable sound effects. Include song name and artist if identifiable, otherwise describe genre and mood. Empty string if no notable audio.",
  "callsToAction": ["Each explicit call-to-action spoken or shown in the video — e.g. 'comment your answer below', 'like if you agree', 'follow for part 2'"],
  "emotionalArc": "How the emotional tone/energy shifts across the video. E.g. 'Opens playfully → tension builds at 0:20 → triumphant resolution at 0:40'. One sentence covering the full arc.",
  "controversialMoments": [
    {
      "timestamp": "0:35",
      "description": "A moment likely to divide viewers or spark debate — a strong opinion, surprising claim, or action that could be interpreted multiple ways."
    }
  ]
}

Guidelines:
- transcript: produce a dense, near-verbatim excerpt in chronological order, prioritising claims, instructions, punchlines, emotionally salient lines, and quotes commenters are likely to reference
- transcript: keep enough surrounding context for each included quote to make sense; target roughly ${transcriptTarget} characters max and append " [truncated]" if you must cut for length
- timeline: cover the FULL video duration in sequential segments of 10-30 seconds each
- keyMoments: identify 3-8 specific timestamps; these are the primary anchors for resolving comment references
- keyEntities.people: describe even unnamed people in enough detail to identify them across references
- visualText: include only salient text anchors; merge repeated captions; exclude watermarks, usernames, platform UI, and auto-captions that merely duplicate spoken dialogue; cap at ${visualTextLimit} items
- controversialMoments: leave as empty array [] if no genuinely controversial moments exist
- All text must be in English
- Return only valid JSON — no trailing commas, no comments inside the JSON${retryNotice}${compactModeNotice}`;
  }

  // ─── Private: parsing ─────────────────────────────────────────────────────

  /**
   * Generate, parse, and recover structured output from Gemini.
   *
   * Flow:
   * 1. Initial full-fidelity video analysis request
   * 2. Local JSON sanitisation + parse
   * 3. Text-only repair pass on malformed JSON
   * 4. One compact retry against the video if the first attempt overflows or repair fails
   * 5. Minimal fallback context as the final degradation path
   */
  private async generateContextWithRecovery(
    fileUri: string,
    videoId: string,
    searchKeyword: string,
    startTime: number
  ): Promise<VideoContext> {
    let lastRawJson = '';
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      const mode = this.getGenerationModeForAttempt(attempt);
      let rawJson: string;
      try {
        rawJson = await this.runUnderstandingPrompt(fileUri, searchKeyword, attempt, mode);
      } catch (error) {
        lastError = error;
        if (error instanceof MaxTokensError) {
          console.warn(
            `[VideoUnderstanding] Output exceeded token budget in ${mode} mode ` +
            `on attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}.`
          );
          if (attempt < MAX_GENERATION_ATTEMPTS) {
            continue;
          }
          return this.buildFallbackContext(
            `[Gemini output truncated (MAX_TOKENS) after ${mode} mode retry]`,
            videoId,
            startTime
          );
        }
        throw error;
      }
      lastRawJson = rawJson;

      const parseAttempt = this.tryParseJson(rawJson);
      if (parseAttempt.parsed) {
        return this.normalizeVideoContext(parseAttempt.parsed, videoId, startTime);
      }

      lastError = parseAttempt.error;
      const savedPath = this.saveMalformedResponse(videoId, rawJson, `attempt_${attempt}`);
      console.warn(
        `[VideoUnderstanding] JSON parse failed on attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}. ` +
        `Error: ${parseAttempt.error}` +
        (savedPath ? ` Raw response saved to ${savedPath}` : '')
      );

      const repairedJson = await this.repairMalformedJson(rawJson, parseAttempt.error);
      if (repairedJson) {
        lastRawJson = repairedJson;
        const repairedAttempt = this.tryParseJson(repairedJson);
        if (repairedAttempt.parsed) {
          console.log(`[VideoUnderstanding] JSON repair succeeded for videoId: ${videoId}`);
          return this.normalizeVideoContext(repairedAttempt.parsed, videoId, startTime);
        }

        lastError = repairedAttempt.error;
        const repairedPath = this.saveMalformedResponse(
          videoId,
          repairedJson,
          `repair_attempt_${attempt}`
        );
        console.warn(
          `[VideoUnderstanding] JSON repair output was still invalid. ` +
          `Error: ${repairedAttempt.error}` +
          (repairedPath ? ` Repaired response saved to ${repairedPath}` : '')
        );
      }
    }

    console.warn(
      `[VideoUnderstanding] Exhausted JSON recovery — using fallback context. ` +
      `Last error: ${lastError}`
    );
    return this.buildFallbackContext(lastRawJson, videoId, startTime);
  }

  // ─── Private: helpers ─────────────────────────────────────────────────────

  /**
   * Infer the MIME type from the video file extension.
   * yt-dlp primarily outputs mp4 for TikTok; webm is a common fallback.
   */
  private inferMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.mp4':  'video/mp4',
      '.webm': 'video/webm',
      '.mov':  'video/quicktime',
      '.avi':  'video/x-msvideo',
      '.mkv':  'video/x-matroska',
    };
    return mimeMap[ext] ?? 'video/mp4';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private getGenerationModeForAttempt(attempt: number): GenerationMode {
    return attempt === 1 ? 'full' : 'compact';
  }

  private getStructuredModel(mode: GenerationMode) {
    return this.genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: mode === 'compact'
          ? COMPACT_VIDEO_CONTEXT_RESPONSE_SCHEMA
          : VIDEO_CONTEXT_RESPONSE_SCHEMA,
        temperature: 0,
        maxOutputTokens: 65536,
      },
    });
  }

  private cleanJsonResponseText(text: string): string {
    return text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
  }

  private tryParseJson(rawJson: string): JsonParseAttempt {
    try {
      const jsonSlice = this.extractJsonObject(rawJson);
      return { parsed: JSON.parse(this.sanitizeJsonControlChars(jsonSlice)) };
    } catch (error) {
      return { error };
    }
  }

  private extractJsonObject(rawJson: string): string {
    const firstBrace = rawJson.indexOf('{');
    let jsonSlice = rawJson;
    if (firstBrace === -1) {
      return jsonSlice;
    }

    let depth = 0;
    let inString = false;
    let escape = false;
    let end = -1;

    for (let i = firstBrace; i < rawJson.length; i++) {
      const ch = rawJson[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) { continue; }
      if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end !== -1) {
      jsonSlice = rawJson.slice(firstBrace, end + 1);
    }
    return jsonSlice;
  }

  private async repairMalformedJson(rawJson: string, parseError: unknown): Promise<string | null> {
    console.warn('[VideoUnderstanding] Attempting text-only JSON repair...');

    try {
      const model = this.getStructuredModel('full');
      const result = await model.generateContent(
        [
          {
            text:
`Convert the malformed JSON-like payload below into valid JSON that matches the required video analysis schema.

Rules:
- Preserve the original meaning whenever possible.
- Do not invent video facts that are not already present.
- If a field is missing or unusable, use an empty string "" or empty array [].
- Escape all embedded quotes and control characters correctly.
- Return only valid JSON.

Parse error:
${String(parseError)}

Malformed payload:
${rawJson}`,
          },
        ],
        { timeout: REPAIR_TIMEOUT_MS },
      );

      const finishReason = result.response.candidates?.[0]?.finishReason;
      if (finishReason === 'MAX_TOKENS') {
        console.warn('[VideoUnderstanding] JSON repair truncated at MAX_TOKENS');
        return null;
      }

      return this.cleanJsonResponseText(result.response.text());
    } catch (error) {
      console.warn(`[VideoUnderstanding] JSON repair request failed: ${error}`);
      return null;
    }
  }

  private saveMalformedResponse(
    videoId: string,
    rawJson: string,
    suffix: string
  ): string | null {
    try {
      fs.mkdirSync(MALFORMED_RESPONSE_DIR, { recursive: true });
      const filePath = path.join(
        MALFORMED_RESPONSE_DIR,
        `${videoId}_${Date.now()}_${suffix}.txt`
      );
      fs.writeFileSync(filePath, rawJson, 'utf8');
      return filePath;
    } catch (error) {
      console.warn(`[VideoUnderstanding] Failed to persist malformed response: ${error}`);
      return null;
    }
  }

  private buildFallbackContext(
    rawJson: string,
    videoId: string,
    startTime: number
  ): VideoContext {
    return {
      mainTopic: 'Video content (analysis parse error)',
      summary: rawJson.substring(0, 500),
      keyEntities: { people: [], objects: [], locations: [] },
      timeline: [],
      keyMoments: [],
      mood: 'unknown',
      implicitContext: [],
      searchKeywordRelevance: '',
      transcript: '',
      visualText: [],
      audioTrack: '',
      callsToAction: [],
      emotionalArc: '',
      controversialMoments: [],
      videoId,
      processingTimeMs: Date.now() - startTime,
    };
  }

  private normalizeVideoContext(parsed: any, videoId: string, startTime: number): VideoContext {
    const data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};

    return {
      mainTopic: typeof data.mainTopic === 'string' ? data.mainTopic : '',
      summary: typeof data.summary === 'string' ? data.summary : '',
      keyEntities: {
        people: this.toStringArray(data.keyEntities?.people),
        objects: this.toStringArray(data.keyEntities?.objects),
        locations: this.toStringArray(data.keyEntities?.locations),
      },
      timeline: this.toTimelineSegments(data.timeline),
      keyMoments: this.toKeyMoments(data.keyMoments),
      mood: typeof data.mood === 'string' ? data.mood : '',
      implicitContext: this.toStringArray(data.implicitContext),
      searchKeywordRelevance: typeof data.searchKeywordRelevance === 'string'
        ? data.searchKeywordRelevance
        : '',
      transcript: this.normalizeTranscriptExcerpt(data.transcript),
      visualText: this.normalizeVisualText(data.visualText),
      audioTrack: typeof data.audioTrack === 'string' ? data.audioTrack : '',
      callsToAction: this.toStringArray(data.callsToAction),
      emotionalArc: typeof data.emotionalArc === 'string' ? data.emotionalArc : '',
      controversialMoments: this.toKeyMoments(data.controversialMoments),
      videoId,
      processingTimeMs: Date.now() - startTime,
    };
  }

  private toStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private normalizeTranscriptExcerpt(value: unknown): string {
    if (typeof value !== 'string') {
      return '';
    }

    return value
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private normalizeVisualText(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const seen = new Set<string>();
    const normalized: string[] = [];

    for (const item of value) {
      if (typeof item !== 'string') {
        continue;
      }

      const trimmed = item.replace(/\s+/g, ' ').trim();
      if (!trimmed) {
        continue;
      }

      if (/^(?:tiktok|capcut|original sound.*|@[\w.]+)$/i.test(trimmed)) {
        continue;
      }

      const dedupeKey = trimmed.toLowerCase();
      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      normalized.push(trimmed);

      if (normalized.length >= FULL_VISUAL_TEXT_LIMIT) {
        break;
      }
    }

    return normalized;
  }

  private toTimelineSegments(value: unknown): TimelineSegment[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .map(item => {
        const segment = item as Record<string, unknown>;
        return {
          start: typeof segment.start === 'string' ? segment.start : '',
          end: typeof segment.end === 'string' ? segment.end : '',
          description: typeof segment.description === 'string' ? segment.description : '',
        };
      })
      .filter(segment => segment.start || segment.end || segment.description);
  }

  private toKeyMoments(value: unknown): KeyMoment[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .map(item => {
        const moment = item as Record<string, unknown>;
        return {
          timestamp: typeof moment.timestamp === 'string' ? moment.timestamp : '',
          description: typeof moment.description === 'string' ? moment.description : '',
        };
      })
      .filter(moment => moment.timestamp || moment.description);
  }

  private sanitizeJsonControlChars(input: string): string {
    let result = '';
    let inString = false;
    let escape = false;
    let i = 0;
    while (i < input.length) {
      const ch = input[i];

      // Inside an escape sequence — always emit next char verbatim
      if (escape) { result += ch; escape = false; i++; continue; }

      // Start of escape sequence inside a string
      if (ch === '\\' && inString) { escape = true; result += ch; i++; continue; }

      // String boundary
      if (ch === '"') { inString = !inString; result += ch; i++; continue; }

      if (inString) {
        // Raw control chars inside strings are invalid JSON — escape them
        if (ch === '\n') { result += '\\n'; i++; continue; }
        if (ch === '\r') { result += '\\r'; i++; continue; }
        if (ch === '\t') { result += '\\t'; i++; continue; }
        if (ch.charCodeAt(0) < 0x20) { i++; continue; }
        result += ch; i++; continue;
      }

      // Outside strings: strip JS-style comments that Gemini sometimes emits
      if (ch === '/' && i + 1 < input.length) {
        if (input[i + 1] === '/') {
          // Single-line comment — skip to end of line
          while (i < input.length && input[i] !== '\n') i++;
          continue;
        }
        if (input[i + 1] === '*') {
          // Block comment — skip to */
          i += 2;
          while (i < input.length - 1 && !(input[i] === '*' && input[i + 1] === '/')) i++;
          i += 2;
          continue;
        }
      }

      result += ch; i++;
    }

    // Remove trailing commas before ] or } (another common Gemini quirk)
    return result.replace(/,(\s*[}\]])/g, '$1');
  }
}
