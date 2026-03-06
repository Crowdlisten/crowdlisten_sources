export interface PolicyContext {
  authScope: 'service'|'user'|'unknown';
  containsPII: boolean;
  statusCode?: number;
  retryCount: number;
  maxRetries: number;
}

export type PolicyDecision = 'allow'|'review'|'deny';

export function evaluatePolicy(ctx: PolicyContext): {decision: PolicyDecision; reasons: string[]} {
  const reasons:string[] = [];
  if (ctx.authScope === 'unknown') return { decision:'deny', reasons:['unknown auth scope'] };
  if (ctx.containsPII && ctx.authScope !== 'service') return { decision:'review', reasons:['PII requires service scope or review'] };
  if (ctx.statusCode && [400,401,403,404,422].includes(ctx.statusCode)) return { decision:'deny', reasons:['non-retryable status'] };
  if (ctx.statusCode && (ctx.statusCode===429 || ctx.statusCode>=500)) {
    if (ctx.retryCount >= ctx.maxRetries) return { decision:'review', reasons:['retry budget exhausted'] };
    return { decision:'allow', reasons:['retryable status within budget'] };
  }
  return { decision:'allow', reasons:['policy checks passed'] };
}
