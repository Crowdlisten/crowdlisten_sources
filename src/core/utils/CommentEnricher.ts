import type { Comment } from '../interfaces/SocialMediaPlatform.js';
import type {
  CommentAnchorRef,
  CommentEnrichmentResult,
  CommentIntent,
  EnrichedComment,
  OpinionUnit,
  VideoAnchor,
} from '../interfaces/CommentAnalysis.js';
import type { VideoContext } from './VideoUnderstanding.js';
import {
  calculateEngagementScore,
  countMeaningfulTokens,
  detectIntent,
  detectNoiseFlags,
  detectStance,
  extractTimestampHints,
  flattenComments,
  inferClusterType,
  isLowValueOpinionSegment,
  isLowValueVisualText,
  jaccardSimilarity,
  normalizeForSimilarity,
  normalizeWhitespace,
  semanticDensity,
  shouldMergeOpinionSegment,
  slugify,
  summarizeAnchor,
  uniqueTokens,
} from './CommentAnalysisUtils.js';

const VAGUE_REFERENCE_MARKERS = [
  'that part',
  'this part',
  'that moment',
  'that one',
  'this one',
  'last one',
  'the last one',
  'first one',
  'when she',
  'when he',
  'when they',
  'when it',
  'same',
  'exactly',
  'this',
  'that',
  'it',
];

const HIGH_CONTEXT_ANCHOR_TYPES = new Set<VideoAnchor['type']>([
  'controversy',
  'moment',
  'spoken_quote',
  'timeline_segment',
]);

const ACTION_MARKERS = [
  'hour',
  'minute',
  'room',
  'temp',
  'temperature',
  'leave',
  'leaving',
  'sit',
  'rest',
  'out',
  'move',
  'flip',
  'pan',
];

const DISCOURSE_SPLIT_PATTERN = /\b(?:but|however|although|though|yet)\b|[;\n]+/i;
const SENTENCE_BOUNDARY_PATTERN = /(?<=[.!?])\s+/;
const GENERIC_PRAISE_PATTERNS = [
  /\bgreat tips?\b/i,
  /\bgood tips?\b/i,
  /\bgood work\b/i,
  /\bkeep it up\b/i,
  /\blove (all|these|your)\b/i,
  /\blove these vids?\b/i,
  /\bgood (and )?simple video\b/i,
  /\bcomments so funny\b/i,
  /\ball of that looks good\b/i,
  /\bi just learned so much\b/i,
  /\bone of the best\b/i,
  /\bamazing\b/i,
  /\bbro is\b/i,
  /\bhe got a little\b/i,
  /\bchill manager\b/i,
];

export class CommentEnricherService {
  enrichComments(videoId: string, comments: Comment[], videoContext?: VideoContext): CommentEnrichmentResult {
    const logs: string[] = [];
    const flattenedComments = flattenComments(comments);
    const videoAnchors = this.buildVideoAnchors(videoId, videoContext, logs);
    const enrichedComments: EnrichedComment[] = [];
    const opinionUnits: OpinionUnit[] = [];
    const enrichedByCommentId = new Map<string, EnrichedComment>();

    logs.push(`Flattened ${flattenedComments.length} comments (including replies)`);
    logs.push(`Built ${videoAnchors.length} video anchors`);

    for (const comment of flattenedComments) {
      const parent = comment.parentCommentId ? enrichedByCommentId.get(comment.parentCommentId) : undefined;
      const enriched = this.enrichSingleComment(videoId, comment, videoAnchors, parent);
      enrichedComments.push(enriched);
      enrichedByCommentId.set(enriched.commentId, enriched);

      const units = this.extractOpinionUnits(enriched, videoAnchors, logs);
      opinionUnits.push(...units);
    }

    logs.push(`Generated ${enrichedComments.length} enriched comments`);
    logs.push(`Generated ${opinionUnits.length} opinion units`);

    return {
      videoContext,
      videoAnchors,
      enrichedComments,
      opinionUnits,
      flattenedComments,
      logs,
    };
  }

  private buildVideoAnchors(videoId: string, videoContext: VideoContext | undefined, logs: string[]): VideoAnchor[] {
    const anchors: VideoAnchor[] = [];
    const seen = new Set<string>();

    const pushAnchor = (anchor: VideoAnchor) => {
      if (seen.has(anchor.anchorId)) return;
      seen.add(anchor.anchorId);
      anchors.push(anchor);
    };

    pushAnchor({
      anchorId: `${videoId}_global_video`,
      videoId,
      type: 'global_video',
      label: videoContext?.mainTopic || 'Video-wide discussion',
      description: videoContext?.summary || 'General discussion about the full video',
      sourceField: 'summary',
    });

    if (!videoContext) {
      logs.push('No video context provided; enrichment will use a global fallback anchor only');
      return anchors;
    }

    // Seed controversy anchors first so duplicate moments keep the more specific
    // controversy tag instead of collapsing into a generic key moment.
    for (const moment of videoContext.controversialMoments) {
      pushAnchor({
        anchorId: `${videoId}_moment_${slugify(moment.timestamp)}_${slugify(moment.description)}`,
        videoId,
        type: 'controversy',
        label: moment.description,
        description: moment.description,
        timestampStart: moment.timestamp,
        sourceField: 'controversialMoments',
      });
    }

    for (const moment of videoContext.keyMoments) {
      pushAnchor({
        anchorId: `${videoId}_moment_${slugify(moment.timestamp)}_${slugify(moment.description)}`,
        videoId,
        type: 'moment',
        label: moment.description,
        description: moment.description,
        timestampStart: moment.timestamp,
        sourceField: 'keyMoments',
      });
    }

    for (const segment of videoContext.timeline) {
      pushAnchor({
        anchorId: `${videoId}_timeline_${slugify(segment.start)}_${slugify(segment.description)}`,
        videoId,
        type: 'timeline_segment',
        label: segment.description,
        description: segment.description,
        timestampStart: segment.start,
        timestampEnd: segment.end,
        sourceField: 'timeline',
      });
    }

    for (const person of videoContext.keyEntities.people) {
      pushAnchor({
        anchorId: `${videoId}_person_${slugify(person)}`,
        videoId,
        type: 'entity',
        label: person,
        description: `Person in the video: ${person}`,
        sourceField: 'keyEntities',
      });
    }

    for (const object of videoContext.keyEntities.objects) {
      pushAnchor({
        anchorId: `${videoId}_object_${slugify(object)}`,
        videoId,
        type: 'entity',
        label: object,
        description: `Object in the video: ${object}`,
        sourceField: 'keyEntities',
      });
    }

    for (const location of videoContext.keyEntities.locations) {
      pushAnchor({
        anchorId: `${videoId}_location_${slugify(location)}`,
        videoId,
        type: 'entity',
        label: location,
        description: `Location in the video: ${location}`,
        sourceField: 'keyEntities',
      });
    }

    const transcriptLines = this.extractTranscriptSnippets(videoContext.transcript);

    transcriptLines.forEach((line, index) => {
      pushAnchor({
        anchorId: `${videoId}_quote_${index}_${slugify(line)}`,
        videoId,
        type: 'spoken_quote',
        label: line,
        description: line,
        sourceField: 'transcript',
      });
    });

    videoContext.visualText
      .map(text => normalizeWhitespace(text))
      .filter(text => text.length > 0 && !isLowValueVisualText(text))
      .slice(0, 15)
      .forEach((text, index) => {
      pushAnchor({
        anchorId: `${videoId}_visual_${index}_${slugify(text)}`,
        videoId,
        type: 'visual_text',
        label: text,
        description: text,
        sourceField: 'visualText',
      });
    });

    videoContext.callsToAction
      .map(cta => normalizeWhitespace(cta))
      .filter(cta => cta.length > 0 && !isLowValueVisualText(cta))
      .slice(0, 8)
      .forEach((cta, index) => {
      pushAnchor({
        anchorId: `${videoId}_cta_${index}_${slugify(cta)}`,
        videoId,
        type: 'cta',
        label: cta,
        description: cta,
        sourceField: 'callsToAction',
      });
    });

    return anchors;
  }

  private enrichSingleComment(
    videoId: string,
    comment: Comment & { parentCommentId?: string; threadRootId?: string; depth: number },
    anchors: VideoAnchor[],
    parent?: EnrichedComment
  ): EnrichedComment {
    const rawText = normalizeWhitespace(comment.text || '');
    const anchorRefs = this.matchAnchors(rawText, anchors, parent);
    const primaryAnchor = anchorRefs[0] ? anchors.find(anchor => anchor.anchorId === anchorRefs[0].anchorId) : undefined;
    const targetType = this.detectTargetType(rawText, comment.parentCommentId, parent);
    const groundingConfidence = anchorRefs[0]?.confidence || 0.2;
    const ambiguityFlags = this.collectAmbiguityFlags(rawText, targetType, primaryAnchor, parent, groundingConfidence);
    const commentIntent = this.detectCommentIntent(rawText, targetType);
    const resolvedText = this.buildResolvedText(rawText, targetType, primaryAnchor, parent, groundingConfidence);

    return {
      commentId: comment.id,
      videoId,
      parentCommentId: comment.parentCommentId,
      threadRootId: comment.threadRootId,
      depth: comment.depth,
      authorId: comment.author.id,
      rawText,
      resolvedText,
      rewriteApplied: resolvedText !== rawText,
      targetType,
      anchorRefs,
      groundingConfidence: Number(groundingConfidence.toFixed(3)),
      ambiguityFlags,
      commentIntent,
      engagement: {
        likes: comment.likes || 0,
        replies: comment.replies?.length || 0,
        weightedScore: Number(calculateEngagementScore(comment).toFixed(3)),
      },
      provenance: {
        enrichmentModel: 'deterministic-grounding-v1',
        promptVersion: 'comment-enrichment-v1',
        createdAt: new Date().toISOString(),
      },
    };
  }

  private matchAnchors(rawText: string, anchors: VideoAnchor[], parent?: EnrichedComment): CommentAnchorRef[] {
    const normalized = normalizeForSimilarity(rawText);
    const timestampHints = extractTimestampHints(normalized);
    const hasVagueReference = VAGUE_REFERENCE_MARKERS.some(marker => normalized.includes(marker));
    const hasNegativeSignal = /(unsafe|risky|wrong|bad|crazy|insane|hate)/.test(normalized);
    const commentTokens = uniqueTokens(normalized);
    const broadVideoComment = this.isBroadVideoComment(normalized, commentTokens, hasVagueReference);
    const scores: CommentAnchorRef[] = [];

    // Combine lexical overlap with a few TikTok-specific heuristics so short
    // phrases such as "that part" can still inherit a plausible moment anchor.
    for (const anchor of anchors) {
      const anchorText = `${anchor.label} ${anchor.description}`;
      const anchorTokens = uniqueTokens(anchorText);
      const tokenOverlap = this.countFuzzyTokenOverlap(commentTokens, anchorTokens);
      const sharedActionMarker = ACTION_MARKERS.some(
        marker => commentTokens.includes(marker) && anchorTokens.includes(marker)
      );
      const weakSpecificMatch =
        broadVideoComment &&
        anchor.type !== 'global_video' &&
        tokenOverlap < 2 &&
        !sharedActionMarker &&
        timestampHints.length === 0 &&
        !normalized.includes(anchor.label.toLowerCase());
      let score = jaccardSimilarity(normalized, anchorText);

      if (timestampHints.length > 0 && (anchor.timestampStart || anchor.timestampEnd)) {
        const anchorTimes = [anchor.timestampStart, anchor.timestampEnd].filter((value): value is string => Boolean(value));
        if (timestampHints.some(timestamp => anchorTimes.includes(timestamp))) {
          score += 0.6;
        }
      }

      if (anchor.type === 'global_video') {
        score = Math.max(score, 0.18);
        if (broadVideoComment) {
          score = Math.max(score, 0.28);
        }
      }

      // Avoid assigning content anchors when there is no shared signal at all.
      // This keeps broad controversies from absorbing unrelated comments.
      if (
        anchor.type !== 'global_video' &&
        tokenOverlap === 0 &&
        !sharedActionMarker &&
        timestampHints.length === 0 &&
        !normalized.includes(anchor.label.toLowerCase())
      ) {
        score = Math.min(score, 0.18);
      }

      // Broad praise or persona comments should not snap to a specific moment or
      // controversy unless they carry real topical overlap. Otherwise they
      // create false high-level themes from generic audience reactions.
      if (
        weakSpecificMatch
      ) {
        score = Math.min(score, 0.19);
      }

      if (tokenOverlap >= 2 && HIGH_CONTEXT_ANCHOR_TYPES.has(anchor.type)) {
        score += 0.12;
      }

      if (sharedActionMarker && HIGH_CONTEXT_ANCHOR_TYPES.has(anchor.type)) {
        score += 0.14;
      }

      if (!broadVideoComment && hasVagueReference && (anchor.type === 'moment' || anchor.type === 'controversy')) {
        score += 0.22;
      }

      if (hasNegativeSignal && anchor.type === 'controversy') {
        score += 0.18;
      }

      if (commentTokens.length > 3 && anchor.type === 'entity') {
        score -= 0.05;
      }

      if (normalized.includes(anchor.label.toLowerCase())) {
        score += 0.3;
      }

      if (weakSpecificMatch) {
        score = Math.min(score, 0.19);
      }

      if (score > 0.2) {
        scores.push({
          anchorId: anchor.anchorId,
          role: scores.length === 0 ? 'primary' : 'secondary',
          confidence: Number(Math.min(0.98, score).toFixed(3)),
        });
      }
    }

    scores.sort((left, right) => right.confidence - left.confidence);

    const promotedScores = this.promoteSpecificAnchors(scores, anchors);
    const filteredScores = promotedScores.filter((ref, index) =>
      index === 0 || ref.confidence >= Math.max((promotedScores[0]?.confidence || 0) - 0.08, 0.28)
    );
    const topMatches: CommentAnchorRef[] = filteredScores.slice(0, 3).map((ref, index) => ({
      ...ref,
      role: (index === 0 ? 'primary' : 'secondary') as 'primary' | 'secondary',
    }));

    // Replies like "same" or "exactly" often depend entirely on the parent. When
    // this comment has no strong match of its own, carry over the parent's anchors.
    if (topMatches.length === 0 && parent?.anchorRefs.length) {
      return parent.anchorRefs.map((ref, index) => ({
        anchorId: ref.anchorId,
        role: index === 0 ? 'primary' : 'secondary',
        confidence: Number(Math.max(ref.confidence - 0.1, 0.35).toFixed(3)),
      }));
    }

    return topMatches;
  }

  private promoteSpecificAnchors(
    scores: CommentAnchorRef[],
    anchors: VideoAnchor[]
  ): CommentAnchorRef[] {
    if (scores.length <= 1) {
      return scores;
    }

    const anchorById = new Map(anchors.map(anchor => [anchor.anchorId, anchor]));
    const promoted = [...scores];
    const currentTop = promoted[0];
    const currentTopPriority = this.anchorPriority(anchorById.get(currentTop.anchorId)?.type);

    for (let index = 1; index < promoted.length; index += 1) {
      const candidate = promoted[index];
      const candidateType = anchorById.get(candidate.anchorId)?.type;
      const candidatePriority = this.anchorPriority(anchorById.get(candidate.anchorId)?.type);
      const promotionSlack = candidateType === 'controversy' ? 0.05 : 0.02;
      const closeEnough = candidate.confidence >= currentTop.confidence - promotionSlack;

      if (candidatePriority > currentTopPriority && closeEnough) {
        promoted.splice(index, 1);
        promoted.unshift(candidate);
        break;
      }
    }

    return promoted;
  }

  private anchorPriority(type: VideoAnchor['type'] | undefined): number {
    switch (type) {
      case 'controversy':
        return 5;
      case 'moment':
        return 4;
      case 'spoken_quote':
      case 'timeline_segment':
        return 3;
      case 'visual_text':
      case 'entity':
        return 2;
      case 'cta':
        return 1;
      default:
        return 0;
    }
  }

  private detectTargetType(
    rawText: string,
    parentCommentId: string | undefined,
    parent: EnrichedComment | undefined
  ): EnrichedComment['targetType'] {
    const normalized = normalizeForSimilarity(rawText);
    const isAgreementReply =
      parentCommentId &&
      (normalized.length <= 24 ||
        VAGUE_REFERENCE_MARKERS.some(marker => normalized.includes(marker)) ||
        normalized === 'yes' ||
        normalized === 'no');

    if (isAgreementReply && parent) {
      return 'parent_comment';
    }

    if (parentCommentId && (normalized.includes('@') || normalized.includes('you '))) {
      return 'thread';
    }

    if (normalized.length === 0) {
      return 'unclear';
    }

    return 'video';
  }

  private collectAmbiguityFlags(
    rawText: string,
    targetType: EnrichedComment['targetType'],
    primaryAnchor: VideoAnchor | undefined,
    parent: EnrichedComment | undefined,
    confidence: number
  ): string[] {
    const normalized = normalizeForSimilarity(rawText);
    const flags: string[] = [];

    if (/\b(he|she|they|it|this|that)\b/.test(normalized) && confidence < 0.6) {
      flags.push('unclear_pronoun');
    }
    if (/\bwhen\b/.test(normalized) && !primaryAnchor?.timestampStart) {
      flags.push('unclear_time_reference');
    }
    if (targetType === 'parent_comment' && !parent) {
      flags.push('reply_target_ambiguous');
    }
    if (!primaryAnchor) {
      flags.push('video_anchor_not_found');
    }
    if (confidence < 0.45) {
      flags.push('multi_interpretation_possible');
    }

    return flags;
  }

  private detectCommentIntent(rawText: string, targetType: EnrichedComment['targetType']): CommentIntent {
    const normalized = normalizeForSimilarity(rawText);

    if (detectNoiseFlags(rawText).includes('spam')) return 'spam';
    if (normalized.includes('?')) return 'question';
    if (normalized.includes('should') || normalized.includes('need to')) return 'advice';
    if (normalized.includes('wrong') || normalized.includes('actually')) return 'correction';
    if (normalized.includes('agree') || normalized === 'same' || normalized === 'exactly') return 'agreement';
    if (normalized.includes('disagree') || normalized === 'nah') return 'disagreement';
    if (normalized.includes('lol') || normalized.includes('haha')) return 'joke';
    if (normalized.includes('love') || normalized.includes('great') || normalized.includes('amazing')) return 'praise';
    if (normalized.includes('bad') || normalized.includes('unsafe') || normalized.includes('hate')) return 'criticism';
    if (targetType === 'thread') return 'meta';
    if (rawText.length <= 10) return 'reaction';
    return 'other';
  }

  private buildResolvedText(
    rawText: string,
    targetType: EnrichedComment['targetType'],
    primaryAnchor: VideoAnchor | undefined,
    parent: EnrichedComment | undefined,
    confidence: number
  ): string {
    const normalized = normalizeForSimilarity(rawText);
    const anchorSummary = primaryAnchor ? summarizeAnchor(primaryAnchor) : '';

    if (targetType === 'parent_comment' && parent) {
      if (normalized === 'same' || normalized === 'exactly' || normalized === 'facts') {
        return `I agree with the parent comment about ${parent.resolvedText.toLowerCase()}.`;
      }
      if (confidence >= 0.35 || rawText.length <= 40) {
        return `${rawText} (replying to: ${parent.resolvedText})`;
      }
    }

    if (confidence < 0.45) {
      return rawText;
    }

    if (primaryAnchor && VAGUE_REFERENCE_MARKERS.some(marker => normalized.includes(marker))) {
      return `${rawText} (referring to ${anchorSummary})`;
    }

    if (primaryAnchor && normalized.includes('when ') && !normalized.includes(anchorSummary.toLowerCase())) {
      return `${rawText} (about ${anchorSummary})`;
    }

    return rawText;
  }

  private extractOpinionUnits(
    enriched: EnrichedComment,
    anchors: VideoAnchor[],
    logs: string[]
  ): OpinionUnit[] {
    const segments = this.splitIntoSegments(this.stripExplanatorySuffix(enriched.resolvedText));
    const units: OpinionUnit[] = [];

    // Cap units per comment so one long comment cannot dominate clustering while
    // still allowing mixed comments to split into separate opinions.
    for (let index = 0; index < Math.min(segments.length, 3); index += 1) {
      const segment = normalizeWhitespace(segments[index]);
      if (!segment) continue;

      const anchorIds = enriched.anchorRefs.map(ref => ref.anchorId);
      const primaryAnchor = anchorIds[0] ? anchors.find(anchor => anchor.anchorId === anchorIds[0]) : undefined;
      const stance = detectStance(segment);
      const intent = detectIntent(segment);
      const noiseFlags = detectNoiseFlags(segment);
      const anchorMatchCount = anchorIds.length;
      const aspectLabel = primaryAnchor?.label || 'Video-wide discussion';
      const aspectKey = primaryAnchor
        ? `${primaryAnchor.type}.${slugify(primaryAnchor.label)}`
        : `video.${slugify(aspectLabel)}`;

      units.push({
        opinionUnitId: `${enriched.commentId}_unit_${index + 1}`,
        commentId: enriched.commentId,
        videoId: enriched.videoId,
        rawSpan: segment,
        normalizedText: normalizeForSimilarity(segment),
        aboutness: {
          anchorIds,
          aspectKey,
          aspectLabel,
        },
        stance,
        intent,
        evidenceSource: enriched.targetType === 'parent_comment'
          ? ['parent_comment']
          : enriched.targetType === 'thread'
            ? ['thread_context']
            : ['video'],
        groundingConfidence: enriched.groundingConfidence,
        semanticDensity: semanticDensity(segment, anchorMatchCount),
        noiseFlags,
        authorId: enriched.authorId,
        engagementScore: enriched.engagement.weightedScore,
      });
    }

    if (units.length === 0) {
      logs.push(`No opinion units extracted for comment ${enriched.commentId}`);
    }

    return units;
  }

  private splitIntoSegments(text: string): string[] {
    const normalized = normalizeWhitespace(text);
    if (!normalized) return [];

    const roughSegments = normalized
      .split(DISCOURSE_SPLIT_PATTERN)
      .flatMap(segment => segment.split(SENTENCE_BOUNDARY_PATTERN))
      .map(segment => normalizeWhitespace(segment))
      .filter(Boolean);

    if (roughSegments.length <= 1) {
      return isLowValueOpinionSegment(normalized) ? [] : [normalized];
    }

    const cleanedSegments: string[] = [];

    for (let index = 0; index < roughSegments.length; index += 1) {
      const segment = roughSegments[index];
      const nextSegment = normalizeWhitespace(roughSegments[index + 1] || '');

      if (this.isExplanatoryAnnotationSegment(segment)) {
        continue;
      }

      if (isLowValueOpinionSegment(segment)) {
        continue;
      }

      if (this.shouldDiscardForFollowingSegment(segment, nextSegment)) {
        continue;
      }

      if (shouldMergeOpinionSegment(segment) && index + 1 < roughSegments.length) {
        if (nextSegment && !isLowValueOpinionSegment(nextSegment)) {
          cleanedSegments.push(`${segment} ${nextSegment}`.trim());
          index += 1;
          continue;
        }
      }

      cleanedSegments.push(segment);
    }

    const uniqueCleaned = Array.from(new Set(cleanedSegments));
    if (uniqueCleaned.length === 0) {
      return [normalized];
    }

    return uniqueCleaned;
  }

  private stripExplanatorySuffix(text: string): string {
    return normalizeWhitespace(
      text
        .replace(/\s*\((?:referring to|about)\s+[^()]*\)\s*$/i, '')
        .replace(/\s*\(replying to:\s*[^()]*\)\s*$/i, '')
    );
  }

  private isExplanatoryAnnotationSegment(text: string): boolean {
    return /^\((?:referring to|about|replying to:)/i.test(normalizeWhitespace(text));
  }

  private shouldDiscardForFollowingSegment(current: string, next: string): boolean {
    if (!next) {
      return false;
    }

    const currentNormalized = normalizeForSimilarity(current);
    const nextNormalized = normalizeForSimilarity(next);
    const currentTokenCount = countMeaningfulTokens(current);
    const nextTokenCount = countMeaningfulTokens(next);
    const currentIsPolitePreface = /^(very informative|informative|helpful|useful|great tips?|good tips?|good info|nice|interesting|thanks|thank you)[.!?]*$/i
      .test(currentNormalized);
    const nextHasDominantSignal =
      nextNormalized.includes('?') ||
      /(won't|wont|don't|dont|can't|cant|not\b|unsafe|risky|wrong|confusing|forget|remember|should|need|useful|helpful|love|hate)/.test(nextNormalized);

    // Drop a short courtesy/setup sentence when the following sentence carries
    // the actual opinion, e.g. "Very informative. I won't remember any of them."
    if (currentIsPolitePreface && nextHasDominantSignal && nextTokenCount >= currentTokenCount) {
      return true;
    }

    return false;
  }

  private extractTranscriptSnippets(transcript: string): string[] {
    const sentenceLikeChunks = transcript
      .split(/\n+/)
      .flatMap(line => line.split(/(?<=[.!?])\s+/))
      .map(line => normalizeWhitespace(line))
      .filter(line => line.length >= 12);

    const snippets: string[] = [];
    for (const chunk of sentenceLikeChunks) {
      if (chunk.length <= 220) {
        snippets.push(chunk);
        continue;
      }

      const clauses = chunk
        .split(/(?<=[,;])\s+/)
        .map(line => normalizeWhitespace(line))
        .filter(line => line.length >= 12);

      snippets.push(...clauses);
    }

    return snippets.slice(0, 12);
  }

  private countFuzzyTokenOverlap(commentTokens: string[], anchorTokens: string[]): number {
    let overlap = 0;

    for (const commentToken of commentTokens) {
      const matched = anchorTokens.some(anchorToken =>
        anchorToken === commentToken ||
        (anchorToken.length >= 4 &&
          commentToken.length >= 4 &&
          (anchorToken.startsWith(commentToken.slice(0, 4)) ||
            commentToken.startsWith(anchorToken.slice(0, 4))))
      );

      if (matched) {
        overlap += 1;
      }
    }

    return overlap;
  }

  private isBroadVideoComment(
    normalized: string,
    commentTokens: string[],
    hasVagueReference: boolean
  ): boolean {
    if (GENERIC_PRAISE_PATTERNS.some(pattern => pattern.test(normalized))) {
      return true;
    }

    if (hasVagueReference) {
      return false;
    }

    if (commentTokens.length <= 3 && /(great|good|love|amazing|cool|best|funny)/.test(normalized)) {
      return true;
    }

    if (/(video|vids?|tips?)\b/.test(normalized) && !/(lettuce|burger|corn|sugar|flour|salt|potato|cheese|bacon|egg|ice cream|chives|knife|pan)/.test(normalized)) {
      return true;
    }

    return false;
  }
}
