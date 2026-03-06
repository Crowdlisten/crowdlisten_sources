export interface AnalysisRoutingInput {
  platform: 'tiktok'|'twitter'|'reddit'|'instagram'|'youtube'|'web'|'rss';
  hasMedia?: boolean;
  requiresDeepAnalysis?: boolean;
  betaEnabled?: boolean;
}

export type AnalysisRoute = 'ga-analyze'|'beta-analysis-run';

export function resolveAnalysisRoute(input: AnalysisRoutingInput): AnalysisRoute {
  if (input.betaEnabled && (input.requiresDeepAnalysis || input.hasMedia)) return 'beta-analysis-run';
  return 'ga-analyze';
}
