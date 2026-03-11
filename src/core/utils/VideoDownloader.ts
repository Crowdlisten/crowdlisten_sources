/**
 * VideoDownloader - yt-dlp wrapper for programmatic TikTok video download
 *
 * This module bridges Module 1 (TikTokBrowserSearch, which returns video URLs)
 * and Module 3 (VideoUnderstanding, which needs local file paths).
 *
 * It wraps the system-level `yt-dlp` CLI tool using Node's child_process.spawn,
 * downloads each video to a local temp directory, and returns structured metadata
 * including the local file path that VideoUnderstanding can consume directly.
 *
 * Why yt-dlp instead of a Node.js HTTP download?
 *   TikTok video stream URLs are signed and short-lived. yt-dlp handles the full
 *   authentication, URL extraction, and download in a single step, and supports
 *   reusing the user's Chrome cookies for region-restricted or login-gated content.
 *
 * Prerequisites (system-level, not npm):
 *   brew install yt-dlp    # or: pip install yt-dlp
 *
 * Pipeline position:
 *   TikTokBrowserSearch → [VideoDownloader] → VideoUnderstanding
 *        returns URLs         downloads .mp4        receives file path
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Metadata and local file path for a successfully downloaded video.
 */
export interface DownloadResult {
  /** TikTok numeric video ID, extracted from the URL */
  videoId: string;

  /** Absolute path to the downloaded video file on local disk */
  filePath: string;

  /** File extension of the downloaded video (typically 'mp4' or 'webm') */
  format: string;

  /** Original TikTok URL that was downloaded */
  sourceUrl: string;

  /** Download duration in milliseconds */
  downloadTimeMs: number;
}

/**
 * Options controlling download behavior.
 */
export interface DownloadOptions {
  /**
   * Directory where videos are saved.
   * Defaults to a `crowdlisten_videos` subfolder inside the OS temp directory.
   */
  outputDir?: string;

  /**
   * Max dimension (px) used in the format selector.
   * Applied to width first (for portrait TikTok videos) then to height (for landscape).
   * Lower value = smaller file + faster Gemini upload, at the cost of visual quality.
   * Default: 720. TikTok's smallest portrait format is 576×756 (~1-3 MB for a 15s clip).
   */
  maxHeight?: number;

  /**
   * Whether to reuse cookies from the system Chrome installation.
   * Strongly recommended for TikTok — avoids region blocks and login walls.
   * Default: true
   */
  useChromecookies?: boolean;

  /**
   * Maximum allowed video duration in seconds.
   * Videos exceeding this will be skipped to avoid large downloads.
   * Default: 600 (10 minutes)
   */
  maxDurationSeconds?: number;
}

// ─── Internal constants ───────────────────────────────────────────────────────

/** Default output directory inside the OS temp folder. */
const DEFAULT_OUTPUT_DIR = path.join(os.tmpdir(), 'crowdlisten_videos');

/**
 * Default max dimension for format selection.
 * TikTok portrait videos have widths starting at 576px, so 720 is the minimum
 * value that reliably matches the smallest available TikTok format.
 */
const DEFAULT_MAX_HEIGHT = 720;

/** Default max duration: skip videos longer than 10 minutes. */
const DEFAULT_MAX_DURATION_SECONDS = 600;

/** Timeout for a single yt-dlp download process (5 minutes). */
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

// ─── Service class ────────────────────────────────────────────────────────────

export class VideoDownloaderService {

  /**
   * Download a single TikTok video by URL.
   *
   * Returns a DownloadResult with the local file path on success.
   * Throws if yt-dlp is not installed, the video is too long, or download fails.
   *
   * @param videoUrl  Full TikTok video URL: https://www.tiktok.com/@user/video/ID
   * @param options   Download configuration (see DownloadOptions)
   */
  async downloadVideo(
    videoUrl: string,
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    const startTime = Date.now();

    const outputDir = options.outputDir ?? DEFAULT_OUTPUT_DIR;
    const maxHeight = options.maxHeight ?? DEFAULT_MAX_HEIGHT;
    const useCookies = options.useChromecookies ?? true;
    const maxDuration = options.maxDurationSeconds ?? DEFAULT_MAX_DURATION_SECONDS;

    // Ensure the output directory exists before spawning yt-dlp
    fs.mkdirSync(outputDir, { recursive: true });

    const videoId = this.extractVideoId(videoUrl);
    console.log(`[VideoDownloader] Starting download — videoId: ${videoId}`);

    // Step 1: Check video duration before downloading to avoid huge files
    await this.checkDuration(videoUrl, maxDuration, useCookies);

    // Step 2: Build yt-dlp arguments and run the download
    const args = this.buildYtDlpArgs(videoUrl, outputDir, maxHeight, useCookies);
    const rawOutput = await this.runYtDlp(args);

    // Step 3: Resolve the actual output file path from yt-dlp's stdout
    const filePath = this.resolveOutputPath(rawOutput, outputDir, videoId);

    const downloadTimeMs = Date.now() - startTime;
    const format = path.extname(filePath).replace('.', '') || 'mp4';

    console.log(
      `[VideoDownloader] Download complete — videoId: ${videoId}, ` +
      `file: ${filePath}, took ${downloadTimeMs}ms`
    );

    return { videoId, filePath, format, sourceUrl: videoUrl, downloadTimeMs };
  }

  /**
   * Download multiple TikTok videos sequentially.
   *
   * Sequential (not parallel) to avoid triggering TikTok's rate limiting.
   * Failed downloads are logged and skipped — the returned array contains
   * only the videos that downloaded successfully.
   *
   * @param videoUrls  Array of TikTok video URLs to download
   * @param options    Download configuration applied to all downloads
   */
  async downloadVideos(
    videoUrls: string[],
    options: DownloadOptions = {}
  ): Promise<DownloadResult[]> {
    const results: DownloadResult[] = [];

    for (let i = 0; i < videoUrls.length; i++) {
      const url = videoUrls[i];
      console.log(`[VideoDownloader] Processing ${i + 1}/${videoUrls.length}: ${url}`);

      try {
        const result = await this.downloadVideo(url, options);
        results.push(result);
      } catch (error) {
        // Log and continue — a single failed download should not abort the batch
        console.warn(`[VideoDownloader] Skipping ${url} — download failed: ${error}`);
      }
    }

    console.log(
      `[VideoDownloader] Batch complete — ` +
      `${results.length}/${videoUrls.length} videos downloaded successfully`
    );

    return results;
  }

  /**
   * Delete a downloaded video file from disk.
   *
   * Call this after VideoUnderstanding has finished processing the file
   * to free up disk space. Gemini Files API retains its own copy for 48h.
   *
   * @param filePath  Absolute path to the file to delete
   */
  cleanup(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[VideoDownloader] Deleted local file: ${filePath}`);
      }
    } catch (error) {
      console.warn(`[VideoDownloader] Could not delete file ${filePath}: ${error}`);
    }
  }

  /**
   * Delete all files in the download output directory.
   * Useful for a full cleanup after a batch processing run.
   *
   * @param outputDir  Directory to clear (defaults to the standard temp dir)
   */
  cleanupAll(outputDir: string = DEFAULT_OUTPUT_DIR): void {
    try {
      if (!fs.existsSync(outputDir)) return;
      const files = fs.readdirSync(outputDir);
      for (const file of files) {
        fs.unlinkSync(path.join(outputDir, file));
      }
      console.log(`[VideoDownloader] Cleared ${files.length} files from: ${outputDir}`);
    } catch (error) {
      console.warn(`[VideoDownloader] Could not clear output directory: ${error}`);
    }
  }

  // ─── Private: yt-dlp interaction ─────────────────────────────────────────

  /**
   * Check the video duration before downloading.
   * Uses `yt-dlp --print duration` which fetches metadata without downloading.
   * Throws if the video exceeds maxDurationSeconds.
   */
  private async checkDuration(
    videoUrl: string,
    maxDurationSeconds: number,
    useCookies: boolean
  ): Promise<void> {
    // URL must come last in yt-dlp argument lists
    const args = ['--print', 'duration', '--impersonate', 'chrome'];
    if (useCookies) args.push('--cookies-from-browser', 'chrome');
    args.push(videoUrl);

    try {
      const output = await this.runYtDlp(args);
      const duration = parseFloat(output.trim());

      if (!isNaN(duration) && duration > maxDurationSeconds) {
        throw new Error(
          `Video duration ${duration}s exceeds maximum allowed ${maxDurationSeconds}s`
        );
      }

      console.log(`[VideoDownloader] Duration check passed — ${duration}s`);
    } catch (error) {
      // If we can't check duration (e.g. metadata unavailable), proceed anyway
      // rather than blocking the download on a non-critical check
      if (error instanceof Error && error.message.includes('exceeds maximum')) {
        throw error; // Re-throw duration violations
      }
      console.warn(`[VideoDownloader] Could not check duration, proceeding: ${error}`);
    }
  }

  /**
   * Build the yt-dlp command-line arguments for a video download.
   *
   * Format selection tries both orientations so the same code works for
   * portrait TikTok videos (width < height) and landscape videos (width > height):
   *   1. `best[width<=N]`  — portrait-first: matches TikTok's 576×756 "540p" format
   *   2. `best[height<=N]` — landscape fallback: matches standard 480p/720p
   *   3. `best`            — last resort: whatever yt-dlp deems best
   *
   * Impersonation: `--impersonate chrome` requires curl_cffi to be installed in
   * yt-dlp's Python environment. Without it, TikTok's bot detection blocks the IP.
   * Install: /opt/homebrew/Cellar/yt-dlp/<version>/libexec/bin/python3 -m pip install curl_cffi
   *
   * Output template: `%(id)s.%(ext)s` produces filenames like `7380123456.mp4`,
   * making it easy to map downloaded files back to their video IDs.
   */
  private buildYtDlpArgs(
    videoUrl: string,
    outputDir: string,
    maxHeight: number,
    useCookies: boolean
  ): string[] {
    const outputTemplate = path.join(outputDir, '%(id)s.%(ext)s');

    const args = [
      // Try width-first for portrait TikTok, then height for landscape, then unconstrained
      '--format', `best[width<=${maxHeight}]/best[height<=${maxHeight}]/best`,
      '--output', outputTemplate,
      '--no-playlist',                  // Never download a playlist, only the single video
      '--no-warnings',                  // Suppress non-critical yt-dlp warnings in stdout
      '--print', 'after_move:filepath', // Print the final file path after download completes
      '--impersonate', 'chrome',        // Required for TikTok bot-detection bypass (needs curl_cffi)
    ];

    if (useCookies) {
      // Reuse the user's existing Chrome TikTok session for authentication
      args.push('--cookies-from-browser', 'chrome');
    }

    args.push(videoUrl);

    return args;
  }

  /**
   * Spawn yt-dlp as a child process with the given arguments.
   *
   * Resolves with the concatenated stdout when the process exits with code 0.
   * Rejects with a descriptive error on non-zero exit or if yt-dlp is not found.
   *
   * A DOWNLOAD_TIMEOUT_MS watchdog kills the process if it stalls, preventing
   * hung downloads from blocking the pipeline indefinitely.
   */
  private runYtDlp(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      let stdoutBuffer = '';
      let stderrBuffer = '';

      const proc = spawn('yt-dlp', args, {
        // Inherit the current process environment so yt-dlp can find Chrome cookies.
        // Prepend Homebrew's bin so yt-dlp is found on macOS even when PATH is minimal.
        env: {
          ...process.env,
          PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? ''}`,
        },
      });

      // Kill the process and reject if it runs too long
      const timeout = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(
          `yt-dlp timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s for args: ${args.slice(-1)}`
        ));
      }, DOWNLOAD_TIMEOUT_MS);

      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
      });

      proc.on('close', (code: number | null) => {
        clearTimeout(timeout);

        if (code === 0) {
          resolve(stdoutBuffer.trim());
        } else {
          reject(new Error(
            `yt-dlp exited with code ${code}. ` +
            `stderr: ${stderrBuffer.substring(0, 500)}`
          ));
        }
      });

      proc.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(timeout);

        // ENOENT means the yt-dlp binary was not found on PATH
        if (err.code === 'ENOENT') {
          reject(new Error(
            'yt-dlp is not installed or not on PATH. ' +
            'Install it with: brew install yt-dlp'
          ));
        } else {
          reject(new Error(`Failed to spawn yt-dlp: ${err.message}`));
        }
      });
    });
  }

  // ─── Private: helpers ─────────────────────────────────────────────────────

  /**
   * Extract the numeric TikTok video ID from a video URL.
   * URL pattern: https://www.tiktok.com/@username/video/{numericId}
   *
   * Falls back to a timestamp-based ID if the URL does not match the pattern
   * (e.g. short links or non-standard URLs handled by yt-dlp).
   */
  private extractVideoId(videoUrl: string): string {
    const match = videoUrl.match(/\/video\/(\d+)/);
    if (match) return match[1];

    // Fallback: use a timestamp as a unique enough identifier
    console.warn(
      `[VideoDownloader] Could not parse video ID from URL: ${videoUrl}. ` +
      `Using timestamp fallback.`
    );
    return `video_${Date.now()}`;
  }

  /**
   * Resolve the absolute path of the downloaded file.
   *
   * yt-dlp prints the final file path to stdout when `--print after_move:filepath`
   * is used. We parse this from the output; if it's not present (e.g. older yt-dlp
   * version), we fall back to searching the output directory for a file whose name
   * starts with the video ID.
   *
   * @param ytDlpOutput  Raw stdout from the yt-dlp process
   * @param outputDir    The directory we told yt-dlp to write to
   * @param videoId      The numeric video ID, used as fallback search key
   */
  private resolveOutputPath(
    ytDlpOutput: string,
    outputDir: string,
    videoId: string
  ): string {
    // Primary: yt-dlp printed the filepath directly (--print after_move:filepath)
    for (const line of ytDlpOutput.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && fs.existsSync(trimmed)) {
        return trimmed;
      }
    }

    // Fallback: scan the output directory for a file starting with the video ID
    if (fs.existsSync(outputDir)) {
      const files = fs.readdirSync(outputDir);
      const match = files.find(f => f.startsWith(videoId));
      if (match) {
        return path.join(outputDir, match);
      }
    }

    throw new Error(
      `Could not locate downloaded file for videoId ${videoId} in ${outputDir}. ` +
      `yt-dlp output: ${ytDlpOutput.substring(0, 200)}`
    );
  }
}
