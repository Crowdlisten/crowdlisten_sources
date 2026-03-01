/**
 * VideoUnderstanding - Gemini-based structured video content analysis
 *
 * This module implements Module 3 of the CrowdListen video pipeline.
 * It uploads a local video file to the Gemini Files API, waits for processing,
 * then sends the video to Gemini 1.5 Pro with a structured "understand the video"
 * prompt that returns rich JSON — including a timestamped timeline and key moments.
 *
 * The resulting VideoContext is consumed downstream by:
 *   - CommentEnricher  (resolves coreference/reference in comments)
 *   - CommentClustering (uses enriched comments for better semantic clusters)
 *
 * Pipeline position:
 *   VideoDownloader → [VideoUnderstanding] → CommentEnricher → CommentClustering
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
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
 * Structured understanding of a video, produced by Gemini 1.5 Pro.
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
   * Full verbatim transcript of all spoken dialogue and voiceover narration.
   * Empty string if the video has no speech. Used to resolve comment references
   * like "when he said...", "that quote", "the part where she mentioned X".
   */
  transcript: string;

  /**
   * On-screen text overlays, subtitles, and captions that appear in the video,
   * separate from spoken audio. TikTok creators frequently add text overlays
   * that commenters quote directly ("that text at the beginning", "the caption").
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

/** Interval between file-state polling requests (ms). */
const POLLING_INTERVAL_MS = 3000;

/**
 * Maximum number of polling attempts before timing out.
 * 40 attempts × 3 s = 2 minutes maximum wait.
 */
const MAX_POLL_ATTEMPTS = 40;

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

    // Step 2: Ask Gemini 1.5 Pro to understand the video
    const rawJson = await this.runUnderstandingPrompt(fileUri, searchKeyword);

    // Step 3: Parse and validate the JSON response into a typed VideoContext
    const context = this.parseVideoContext(rawJson, videoId, startTime);

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
   * Send the uploaded video (referenced by URI) to Gemini 1.5 Pro with
   * the structured understanding prompt. Returns the raw response string.
   *
   * The prompt instructs Gemini to return only JSON — no markdown, no prose.
   * We strip any accidental code fences before returning.
   */
  private async runUnderstandingPrompt(fileUri: string, searchKeyword: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const prompt = this.buildPrompt(searchKeyword);

    const result = await model.generateContent([
      {
        // Reference the uploaded video file by its Gemini Files URI
        fileData: {
          fileUri,
          mimeType: 'video/mp4',
        },
      },
      { text: prompt },
    ]);

    const raw = result.response.text();

    // Strip markdown code fences if Gemini wrapped the JSON in ```json ... ```
    return raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
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
  private buildPrompt(searchKeyword: string): string {
    // Only include the searchKeywordRelevance field if a keyword was provided
    const relevanceField = searchKeyword
      ? `  "searchKeywordRelevance": "How this video relates to the search keyword '${searchKeyword}' (1-2 sentences)",`
      : `  "searchKeywordRelevance": "",`;

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
  "transcript": "Full verbatim transcription of ALL spoken words and voiceover narration in the video, in order. Empty string if no speech.",
  "visualText": ["Each distinct on-screen text overlay, subtitle, or caption that appears — quoted verbatim. Exclude the video's own auto-generated subtitles if they duplicate the transcript."],
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
- transcript: capture every spoken word verbatim; use "[inaudible]" for unclear audio
- timeline: cover the FULL video duration in sequential segments of 10-30 seconds each
- keyMoments: identify 3-8 specific timestamps; these are the primary anchors for resolving comment references
- keyEntities.people: describe even unnamed people in enough detail to identify them across references
- controversialMoments: leave as empty array [] if no genuinely controversial moments exist
- All text must be in English
- Return only valid JSON — no trailing commas, no comments inside the JSON`;
  }

  // ─── Private: parsing ─────────────────────────────────────────────────────

  /**
   * Parse the raw JSON string from Gemini into a typed VideoContext.
   *
   * If parsing fails (e.g. Gemini returned a partial or malformed response),
   * we return a minimal fallback context rather than throwing — this allows
   * the pipeline to continue with degraded enrichment quality rather than
   * failing entirely.
   */
  private parseVideoContext(
    rawJson: string,
    videoId: string,
    startTime: number
  ): VideoContext {
    const processingTimeMs = Date.now() - startTime;

    let parsed: any;
    try {
      parsed = JSON.parse(rawJson);
    } catch (parseError) {
      console.warn(
        `[VideoUnderstanding] JSON parse failed — using fallback context. ` +
        `Error: ${parseError}`
      );
      // Return a minimal context so downstream steps can still run
      return {
        mainTopic: 'Video content (analysis parse error)',
        summary: rawJson.substring(0, 500), // Store raw text as best-effort summary
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
        processingTimeMs,
      };
    }

    return {
      mainTopic: parsed.mainTopic || '',
      summary: parsed.summary || '',
      keyEntities: {
        people: Array.isArray(parsed.keyEntities?.people) ? parsed.keyEntities.people : [],
        objects: Array.isArray(parsed.keyEntities?.objects) ? parsed.keyEntities.objects : [],
        locations: Array.isArray(parsed.keyEntities?.locations) ? parsed.keyEntities.locations : [],
      },
      timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
      keyMoments: Array.isArray(parsed.keyMoments) ? parsed.keyMoments : [],
      mood: parsed.mood || '',
      implicitContext: Array.isArray(parsed.implicitContext) ? parsed.implicitContext : [],
      searchKeywordRelevance: parsed.searchKeywordRelevance || '',
      transcript: parsed.transcript || '',
      visualText: Array.isArray(parsed.visualText) ? parsed.visualText : [],
      audioTrack: parsed.audioTrack || '',
      callsToAction: Array.isArray(parsed.callsToAction) ? parsed.callsToAction : [],
      emotionalArc: parsed.emotionalArc || '',
      controversialMoments: Array.isArray(parsed.controversialMoments) ? parsed.controversialMoments : [],
      videoId,
      processingTimeMs,
    };
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
}
