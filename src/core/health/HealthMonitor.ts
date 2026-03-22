/**
 * Proactive Health Monitor
 *
 * Periodically checks platform health in the background, tracks response
 * times, consecutive failures, and degradation state. The MCP health_check
 * tool reads cached state from here instead of doing a live probe every
 * time, making it fast and non-blocking.
 *
 * Three-state model: healthy -> degraded -> down
 *   - healthy:  last check succeeded with results
 *   - degraded: last check returned 0 results, or 1-2 consecutive failures
 *   - down:     3+ consecutive failures
 */

import { PlatformType } from '../interfaces/SocialMediaPlatform.js';

export type HealthStatus = 'healthy' | 'degraded' | 'down';

export interface PlatformHealthState {
  platform: PlatformType;
  status: HealthStatus;
  lastChecked: Date;
  lastHealthy: Date | null;
  consecutiveFailures: number;
  responseTimeMs: number | null;
  error?: string;
}

export interface HealthSummary {
  overall: HealthStatus;
  platforms: Record<string, PlatformHealthState>;
  lastFullCheck: Date | null;
}

export type HealthCheckFn = (
  platform: PlatformType
) => Promise<{ success: boolean; resultCount: number }>;

/**
 * Default check interval: 5 minutes.
 * Default per-platform timeout: 15 seconds.
 */
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const CHECK_TIMEOUT_MS = 15_000;
const STARTUP_DELAY_MS = 10_000;
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

export class HealthMonitor {
  private states: Map<PlatformType, PlatformHealthState> = new Map();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private startupTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastFullCheck: Date | null = null;

  constructor(
    private checkFn: HealthCheckFn,
    private platforms: PlatformType[],
    private intervalMs: number = DEFAULT_INTERVAL_MS
  ) {
    for (const p of platforms) {
      this.states.set(p, {
        platform: p,
        status: 'healthy', // optimistic start
        lastChecked: new Date(0),
        lastHealthy: null,
        consecutiveFailures: 0,
        responseTimeMs: null,
      });
    }
  }

  /**
   * Start background health checks.
   * The first check runs after a short delay so it does not block MCP
   * server startup.
   */
  start(): void {
    if (this.intervalId) return;

    this.startupTimeoutId = setTimeout(() => {
      this.checkAll().catch((err) =>
        console.error('[HealthMonitor] Initial check error:', err)
      );
    }, STARTUP_DELAY_MS);

    this.intervalId = setInterval(() => {
      this.checkAll().catch((err) =>
        console.error('[HealthMonitor] Periodic check error:', err)
      );
    }, this.intervalMs);

    console.error(
      `[HealthMonitor] Started — checking ${this.platforms.length} platforms every ${Math.round(this.intervalMs / 1000)}s`
    );
  }

  /**
   * Stop background health checks and clean up timers.
   */
  stop(): void {
    if (this.startupTimeoutId) {
      clearTimeout(this.startupTimeoutId);
      this.startupTimeoutId = null;
    }
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    console.error('[HealthMonitor] Stopped');
  }

  /**
   * Check all platforms in parallel. One failing platform does not block
   * or affect the others.
   */
  async checkAll(): Promise<HealthSummary> {
    await Promise.allSettled(
      this.platforms.map((p) => this.checkPlatform(p))
    );
    this.lastFullCheck = new Date();
    return this.getSummary();
  }

  /**
   * Check a single platform and update its state.
   */
  async checkPlatform(platform: PlatformType): Promise<PlatformHealthState> {
    const state = this.states.get(platform);
    if (!state) {
      throw new Error(`Unknown platform: ${platform}`);
    }

    const start = Date.now();

    try {
      const result = await Promise.race([
        this.checkFn(platform),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('Health check timeout')),
            CHECK_TIMEOUT_MS
          )
        ),
      ]);

      const elapsed = Date.now() - start;

      if (result.success && result.resultCount > 0) {
        state.status = 'healthy';
        state.lastHealthy = new Date();
        state.consecutiveFailures = 0;
        state.error = undefined;
      } else if (result.success && result.resultCount === 0) {
        // Responded but returned nothing — might be a transient issue
        state.consecutiveFailures++;
        state.status =
          state.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD
            ? 'down'
            : 'degraded';
      } else {
        state.consecutiveFailures++;
        state.status =
          state.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD
            ? 'down'
            : 'degraded';
      }

      state.responseTimeMs = elapsed;
    } catch (error: unknown) {
      state.consecutiveFailures++;
      state.status =
        state.consecutiveFailures >= CONSECUTIVE_FAILURE_THRESHOLD
          ? 'down'
          : 'degraded';
      state.error =
        error instanceof Error ? error.message : String(error);
      state.responseTimeMs = Date.now() - start;
    }

    state.lastChecked = new Date();
    return { ...state };
  }

  /**
   * Get a snapshot summary of all platform health states.
   */
  getSummary(): HealthSummary {
    const platforms: Record<string, PlatformHealthState> = {};
    let hasDown = false;
    let hasDegraded = false;

    for (const [key, state] of this.states) {
      platforms[key] = { ...state };
      if (state.status === 'down') hasDown = true;
      if (state.status === 'degraded') hasDegraded = true;
    }

    return {
      overall: hasDown ? 'down' : hasDegraded ? 'degraded' : 'healthy',
      platforms,
      lastFullCheck: this.lastFullCheck,
    };
  }

  /**
   * Get health state for a single platform. Returns undefined if the
   * platform is not being monitored.
   */
  getState(platform: PlatformType): PlatformHealthState | undefined {
    const state = this.states.get(platform);
    return state ? { ...state } : undefined;
  }

  /**
   * Whether the monitor has recent data (checked within the given ms).
   */
  hasRecentData(withinMs: number = DEFAULT_INTERVAL_MS): boolean {
    if (!this.lastFullCheck) return false;
    return Date.now() - this.lastFullCheck.getTime() < withinMs;
  }
}
