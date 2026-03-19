import type { Comment } from '../interfaces/SocialMediaPlatform.js';
import type {
  LocalCluster,
  OpinionIntent,
  OpinionStance,
  VideoAnchor,
} from '../interfaces/CommentAnalysis.js';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from',
  'had', 'has', 'have', 'he', 'her', 'here', 'hers', 'him', 'his', 'how', 'i',
  'if', 'in', 'into', 'is', 'it', 'its', 'just', 'me', 'my', 'of', 'on', 'or',
  'our', 'ours', 'she', 'so', 'that', 'the', 'their', 'them', 'there', 'they',
  'this', 'to', 'too', 'us', 'was', 'we', 'were', 'what', 'when', 'where', 'which',
  'who', 'why', 'with', 'you', 'your', 'yours'
]);

const POSITIVE_MARKERS = [
  'love', 'great', 'good', 'amazing', 'awesome', 'best', 'perfect', 'smart',
  'helpful', 'useful', 'nice', 'impressive', 'fire', 'excellent', 'cool'
];

const NEGATIVE_MARKERS = [
  'bad', 'wrong', 'unsafe', 'hate', 'terrible', 'awful', 'confusing', 'misleading',
  'risky', 'annoying', 'fake', 'boring', 'stupid', 'crazy', 'insane', 'disagree'
];

const HUMOR_MARKERS = ['lol', 'lmao', 'lmfao', 'haha', 'hehe', 'rofl'];
const AGREEMENT_MARKERS = ['same', 'exactly', 'facts', 'true', 'agree', 'yep', 'yes'];
const DISAGREEMENT_MARKERS = ['nah', 'nope', 'wrong', 'disagree', 'not true', 'actually'];
const ADVICE_MARKERS = ['should', 'need', 'must', 'try', 'recommend', 'would', 'better'];
const QUESTION_WORDS = ['what', 'why', 'how', 'when', 'where', 'which', 'who'];

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function normalizeForSimilarity(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

export function slugify(value: string): string {
  return normalizeForSimilarity(value)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'item';
}

export function tokenize(value: string): string[] {
  return normalizeForSimilarity(value)
    .split(/[^a-z0-9:]+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));
}

export function uniqueTokens(value: string): string[] {
  return Array.from(new Set(tokenize(value)));
}

export function jaccardSimilarity(left: string, right: string): number {
  const leftTokens = new Set(uniqueTokens(left));
  const rightTokens = new Set(uniqueTokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union === 0 ? 0 : intersection / union;
}

export function extractTimestampHints(text: string): string[] {
  return Array.from(text.matchAll(/\b(\d{1,2}:\d{2})\b/g)).map(match => match[1]);
}

export function flattenComments(
  comments: Comment[],
  parentCommentId?: string,
  threadRootId?: string,
  depth: number = 0
): Array<Comment & { parentCommentId?: string; threadRootId?: string; depth: number }> {
  const flattened: Array<Comment & { parentCommentId?: string; threadRootId?: string; depth: number }> = [];

  for (const comment of comments) {
    const rootId = threadRootId || comment.id;
    flattened.push({
      ...comment,
      parentCommentId,
      threadRootId: rootId,
      depth,
    });

    if (comment.replies && comment.replies.length > 0) {
      flattened.push(...flattenComments(comment.replies, comment.id, rootId, depth + 1));
    }
  }

  return flattened;
}

export function calculateEngagementScore(comment: Comment): number {
  const likes = Math.max(comment.likes || 0, 0);
  const replyCount = Math.max(comment.replies?.length || 0, 0);
  const shares = Math.max(comment.engagement?.shares || 0, 0);
  const views = Math.max(comment.engagement?.views || 0, 0);
  const baseScore = Math.max(comment.engagement?.score || 0, 0);

  return (
    1.0 * Math.log1p(likes) +
    1.5 * Math.log1p(replyCount) +
    1.2 * Math.log1p(shares) +
    0.3 * Math.log1p(views) +
    0.5 * Math.log1p(baseScore)
  );
}

export function detectStance(text: string): OpinionStance {
  const normalized = normalizeForSimilarity(text);
  const hasQuestionMark = normalized.includes('?') || QUESTION_WORDS.some(word => normalized.startsWith(`${word} `));
  if (hasQuestionMark) return 'question';
  if (HUMOR_MARKERS.some(marker => normalized.includes(marker))) return 'humor';

  const positiveHits = POSITIVE_MARKERS.filter(marker => normalized.includes(marker)).length;
  const negativeHits = NEGATIVE_MARKERS.filter(marker => normalized.includes(marker)).length;

  if (positiveHits > 0 && negativeHits > 0) return 'mixed';
  if (negativeHits > 0) return 'negative';
  if (positiveHits > 0) return 'positive';
  if (ADVICE_MARKERS.some(marker => normalized.includes(marker))) return 'request';
  return 'observation';
}

export function detectIntent(text: string): OpinionIntent {
  const normalized = normalizeForSimilarity(text);
  if (HUMOR_MARKERS.some(marker => normalized.includes(marker))) return 'joke';
  if (QUESTION_WORDS.some(word => normalized.startsWith(`${word} `)) || normalized.includes('?')) {
    return 'information_request';
  }
  if (ADVICE_MARKERS.some(marker => normalized.includes(marker))) return 'advice';
  if (AGREEMENT_MARKERS.some(marker => normalized === marker || normalized.includes(` ${marker}`))) {
    return 'agreement';
  }
  if (DISAGREEMENT_MARKERS.some(marker => normalized.includes(marker))) {
    return 'disagreement';
  }
  if (normalized.includes('confused') || normalized.includes("don't get") || normalized.includes('dont get')) {
    return 'confusion';
  }
  return 'feedback';
}

export function detectNoiseFlags(text: string): string[] {
  const normalized = normalizeForSimilarity(text);
  const alphaNumericCount = normalized.replace(/[^a-z0-9]/g, '').length;
  const tokens = uniqueTokens(text);
  const flags: string[] = [];

  if (alphaNumericCount === 0) flags.push('emoji_only');
  if (alphaNumericCount > 0 && alphaNumericCount <= 4) flags.push('ultra_short');
  if (tokens.length <= 1 && (HUMOR_MARKERS.includes(normalized) || AGREEMENT_MARKERS.includes(normalized))) {
    flags.push('reaction_only');
  }
  if (normalized.includes('follow me') || normalized.includes('check my page') || normalized.includes('dm me')) {
    flags.push('spam');
  }

  return flags;
}

export function semanticDensity(text: string, anchorMatchCount: number): number {
  const tokenCount = uniqueTokens(text).length;
  const density = Math.min(1, (tokenCount / 10) + (anchorMatchCount * 0.15));
  return Number(density.toFixed(3));
}

export function inferClusterType(
  stance: OpinionStance,
  intent: OpinionIntent,
  noiseFlags: string[]
): LocalCluster['clusterType'] {
  if (noiseFlags.includes('spam')) return 'spam';
  if (noiseFlags.includes('reaction_only')) return 'reaction_only';
  if (stance === 'question' || intent === 'information_request') return 'question';
  if (stance === 'humor' || intent === 'joke') return 'humor';
  if (noiseFlags.length > 0) return 'mixed_noise';
  return 'opinion';
}

export function summarizeAnchor(anchor: VideoAnchor): string {
  if (anchor.timestampStart && anchor.timestampEnd) {
    return `${anchor.timestampStart}-${anchor.timestampEnd}: ${anchor.label}`;
  }
  if (anchor.timestampStart) {
    return `${anchor.timestampStart}: ${anchor.label}`;
  }
  return anchor.label;
}

export function representativeTextsFromCluster(
  cluster: LocalCluster,
  textsByCommentId: Map<string, string>
): string[] {
  return cluster.representativeCommentIds
    .map(commentId => textsByCommentId.get(commentId))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

export function topKeywords(texts: string[], limit: number = 5): string[] {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const token of uniqueTokens(text)) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([token]) => token);
}
