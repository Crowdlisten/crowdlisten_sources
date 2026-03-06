export type SourcePlatform = 'tiktok'|'twitter'|'reddit'|'instagram'|'youtube'|'web'|'rss';

export interface IngestEnvelope {
  trace_id: string;
  idempotency_key: string;
  source_url: string;
  platform: SourcePlatform;
  retrieved_at: string;
  raw_payload: unknown;
  normalized_payload: Record<string, unknown>;
  provenance?: { model?: string; model_version?: string; prompt_version?: string };
}

export function buildIngestEnvelope(input: Omit<IngestEnvelope,'retrieved_at'> & {retrieved_at?: string}): IngestEnvelope {
  return { ...input, retrieved_at: input.retrieved_at ?? new Date().toISOString() };
}

export function validateIngestEnvelope(e: IngestEnvelope): {ok:boolean; errors:string[]} {
  const errors:string[] = [];
  if (!e.trace_id) errors.push('trace_id required');
  if (!e.idempotency_key) errors.push('idempotency_key required');
  if (!e.source_url) errors.push('source_url required');
  if (!e.platform) errors.push('platform required');
  if (!e.retrieved_at) errors.push('retrieved_at required');
  if (e.raw_payload === undefined) errors.push('raw_payload required');
  if (!e.normalized_payload) errors.push('normalized_payload required');
  return { ok: errors.length===0, errors };
}
