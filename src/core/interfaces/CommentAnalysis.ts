import type { Comment } from './SocialMediaPlatform.js';
import type { VideoContext } from '../utils/VideoUnderstanding.js';

export type VideoAnchorType =
  | 'moment'
  | 'timeline_segment'
  | 'entity'
  | 'spoken_quote'
  | 'visual_text'
  | 'cta'
  | 'controversy'
  | 'global_video';

export interface VideoAnchor {
  anchorId: string;
  videoId: string;
  type: VideoAnchorType;
  label: string;
  description: string;
  timestampStart?: string;
  timestampEnd?: string;
  sourceField:
    | 'keyMoments'
    | 'timeline'
    | 'keyEntities'
    | 'transcript'
    | 'visualText'
    | 'callsToAction'
    | 'controversialMoments'
    | 'summary';
}

export type CommentTargetType = 'video' | 'parent_comment' | 'thread' | 'other' | 'unclear';

export interface CommentAnchorRef {
  anchorId: string;
  role: 'primary' | 'secondary';
  confidence: number;
}

export type CommentIntent =
  | 'reaction'
  | 'praise'
  | 'criticism'
  | 'question'
  | 'advice'
  | 'correction'
  | 'agreement'
  | 'disagreement'
  | 'joke'
  | 'meta'
  | 'spam'
  | 'other';

export interface EnrichedComment {
  commentId: string;
  videoId: string;
  parentCommentId?: string;
  threadRootId?: string;
  depth: number;
  authorId: string;
  rawText: string;
  resolvedText: string;
  rewriteApplied: boolean;
  targetType: CommentTargetType;
  anchorRefs: CommentAnchorRef[];
  groundingConfidence: number;
  ambiguityFlags: string[];
  commentIntent: CommentIntent;
  engagement: {
    likes: number;
    replies: number;
    weightedScore: number;
  };
  provenance: {
    enrichmentModel: string;
    promptVersion: string;
    createdAt: string;
  };
}

export type OpinionStance =
  | 'positive'
  | 'negative'
  | 'mixed'
  | 'question'
  | 'request'
  | 'observation'
  | 'humor'
  | 'other';

export type OpinionIntent =
  | 'feedback'
  | 'advice'
  | 'confusion'
  | 'agreement'
  | 'disagreement'
  | 'information_request'
  | 'joke'
  | 'other';

export interface OpinionUnit {
  opinionUnitId: string;
  commentId: string;
  videoId: string;
  rawSpan?: string;
  normalizedText: string;
  aboutness: {
    anchorIds: string[];
    aspectKey: string;
    aspectLabel: string;
  };
  stance: OpinionStance;
  intent: OpinionIntent;
  evidenceSource: Array<'video' | 'parent_comment' | 'thread_context'>;
  groundingConfidence: number;
  semanticDensity: number;
  noiseFlags: string[];
  authorId: string;
  engagementScore: number;
}

export type LocalClusterType =
  | 'opinion'
  | 'question'
  | 'humor'
  | 'reaction_only'
  | 'spam'
  | 'off_topic'
  | 'mixed_noise';

export interface LocalCluster {
  localClusterId: string;
  videoId: string;
  primaryAspectKey: string;
  primaryAspectLabel: string;
  anchorIds: string[];
  stanceProfile: {
    dominant: OpinionStance;
    distribution: Record<string, number>;
  };
  unitIds: string[];
  commentIds: string[];
  size: number;
  uniqueAuthors: number;
  totalEngagement: number;
  replyDepthScore: number;
  averageGroundingConfidence: number;
  averageSemanticDensity: number;
  importanceScore: number;
  clusterType: LocalClusterType;
  label: string;
  summary: string;
  representativeCommentIds: string[];
}

export interface MetaCluster {
  metaClusterId: string;
  canonicalTheme: string;
  canonicalAspectKey: string;
  canonicalStance: OpinionStance | 'mixed';
  localClusterIds: string[];
  videoIds: string[];
  coverage: {
    videos: number;
    comments: number;
    uniqueAuthors: number;
  };
  importanceScore: number;
  recurrenceScore: number;
  controversyScore: number;
  confidence: number;
  label: string;
  summary: string;
  representativeCommentIds: string[];
}

export interface Insight {
  insightId: string;
  scope: 'single_video' | 'cross_video';
  clusterIds: string[];
  title: string;
  description: string;
  whyItMatters: string;
  supportingVideoIds: string[];
  supportingCommentIds: string[];
  supportingAnchors: string[];
  importanceScore: number;
  confidence: number;
}

export interface AskLayerIndex {
  defaultScope: 'single_video' | 'cross_video';
  defaultGrouping: Array<'aboutness' | 'stance' | 'importance'>;
  availableScopes: Array<'single_video' | 'cross_video'>;
  availableStances: string[];
  availableIntents: string[];
  availableClusterTypes: LocalClusterType[];
  availableAspectKeys: string[];
}

export interface CommentEnrichmentResult {
  videoContext?: VideoContext;
  videoAnchors: VideoAnchor[];
  enrichedComments: EnrichedComment[];
  opinionUnits: OpinionUnit[];
  flattenedComments: Array<Comment & { parentCommentId?: string; threadRootId?: string; depth: number }>;
  logs: string[];
}
