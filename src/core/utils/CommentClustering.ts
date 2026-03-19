import type { Comment, CommentCluster, CommentClustering } from '../interfaces/SocialMediaPlatform.js';
import type {
  AskLayerIndex,
  CommentEnrichmentResult,
  EnrichedComment,
  Insight,
  LocalCluster,
  LocalClusterType,
  MetaCluster,
  OpinionStance,
  OpinionUnit,
} from '../interfaces/CommentAnalysis.js';
import type { VideoContext } from './VideoUnderstanding.js';
import { CommentEnricherService } from './CommentEnricher.js';
import {
  calculateEngagementScore,
  inferClusterType,
  jaccardSimilarity,
  normalizeForSimilarity,
} from './CommentAnalysisUtils.js';

interface SingleVideoClusteringInput {
  videoId: string;
  comments: Comment[];
  enrichment: CommentEnrichmentResult;
  videoContext?: VideoContext;
}

interface CrossVideoClusteringInput {
  videoIds: string[];
  clusterings: Array<{
    videoId: string;
    clustering: CommentClustering;
    videoContext?: VideoContext;
  }>;
}

interface LocalClusterAccumulator {
  videoId: string;
  primaryAspectKey: string;
  primaryAspectLabel: string;
  anchorIds: Set<string>;
  units: OpinionUnit[];
}

interface MetaClusterAccumulator {
  signatureText: string;
  localClusters: LocalCluster[];
}

export class CommentClusteringService {
  private enricher: CommentEnricherService;

  constructor() {
    this.enricher = new CommentEnricherService();
  }

  async clusterComments(comments: Comment[], maxComments: number = 200): Promise<CommentClustering> {
    const selectedComments = comments
      .slice()
      .sort((left, right) => calculateEngagementScore(right) - calculateEngagementScore(left))
      .slice(0, maxComments);

    const enrichment = this.enricher.enrichComments('content', selectedComments);
    return this.clusterSingleVideo({
      videoId: 'content',
      comments: selectedComments,
      enrichment,
    });
  }

  async clusterSingleVideo(input: SingleVideoClusteringInput): Promise<CommentClustering> {
    const { videoId, comments, enrichment } = input;
    const logs = [...enrichment.logs];
    const commentsById = new Map(
      enrichment.flattenedComments.map(comment => [comment.id, comment as unknown as Comment])
    );
    const enrichedByCommentId = new Map(enrichment.enrichedComments.map(comment => [comment.commentId, comment]));

    const localClusters = this.buildLocalClusters(videoId, enrichment.opinionUnits, enrichedByCommentId, logs);
    const legacyClusters = this.toLegacyClusters(localClusters, commentsById);
    const insights = this.buildInsightsFromLocalClusters(videoId, localClusters);
    const askLayerIndex = this.buildAskLayerIndex(localClusters, []);
    const overallAnalysis = this.buildSingleVideoSummary(localClusters, insights);

    logs.push(`Built ${localClusters.length} local clusters for ${videoId}`);
    logs.push(`Built ${insights.length} single-video insights for ${videoId}`);

    return {
      totalComments: enrichment.flattenedComments.length,
      clustersCount: legacyClusters.length,
      clusters: legacyClusters,
      overallAnalysis,
      logs,
      enrichedComments: enrichment.enrichedComments,
      opinionUnits: enrichment.opinionUnits,
      videoAnchors: enrichment.videoAnchors,
      localClusters,
      metaClusters: [],
      insights,
      askLayerIndex,
    };
  }

  buildCrossVideoClustering(input: CrossVideoClusteringInput): Pick<CommentClustering, 'metaClusters' | 'insights' | 'logs' | 'askLayerIndex' | 'overallAnalysis'> {
    const logs: string[] = [];
    const allLocalClusters = input.clusterings.flatMap(item => item.clustering.localClusters || []);
    const metaClusters = this.buildMetaClusters(allLocalClusters, input.videoIds, logs);
    const insights = this.buildInsightsFromMetaClusters(metaClusters);
    const askLayerIndex = this.buildAskLayerIndex(allLocalClusters, metaClusters);
    const overallAnalysis = this.buildCrossVideoSummary(metaClusters, insights, input.videoIds.length);

    logs.push(`Built ${metaClusters.length} meta clusters across ${input.videoIds.length} videos`);
    logs.push(`Built ${insights.length} cross-video insights`);

    return {
      metaClusters,
      insights,
      logs,
      askLayerIndex,
      overallAnalysis,
    };
  }

  isClusteringAvailable(): boolean {
    return true;
  }

  private buildLocalClusters(
    videoId: string,
    opinionUnits: OpinionUnit[],
    enrichedByCommentId: Map<string, EnrichedComment>,
    logs: string[]
  ): LocalCluster[] {
    const coarseBuckets = new Map<string, LocalClusterAccumulator>();

    // Group by aboutness first so different moments, entities, or claims stay
    // separate before any lexical similarity scoring happens.
    for (const unit of opinionUnits) {
      const bucketKey = `${videoId}::${unit.aboutness.aspectKey}`;
      const existing = coarseBuckets.get(bucketKey);
      if (existing) {
        existing.units.push(unit);
        unit.aboutness.anchorIds.forEach(anchorId => existing.anchorIds.add(anchorId));
        continue;
      }

      coarseBuckets.set(bucketKey, {
        videoId,
        primaryAspectKey: unit.aboutness.aspectKey,
        primaryAspectLabel: unit.aboutness.aspectLabel,
        anchorIds: new Set(unit.aboutness.anchorIds),
        units: [unit],
      });
    }

    logs.push(`Created ${coarseBuckets.size} coarse buckets for ${videoId}`);

    const localClusters: LocalCluster[] = [];

    for (const bucket of coarseBuckets.values()) {
      const clusterGroups = this.buildFineClusters(bucket.units);
      for (const group of clusterGroups) {
        localClusters.push(
          this.finalizeLocalCluster(
            bucket.videoId,
            bucket.primaryAspectKey,
            bucket.primaryAspectLabel,
            Array.from(bucket.anchorIds),
            group,
            enrichedByCommentId
          )
        );
      }
    }

    return this.normalizeLocalClusterImportance(localClusters)
      .sort((left, right) => right.importanceScore - left.importanceScore);
  }

  private buildFineClusters(units: OpinionUnit[]): OpinionUnit[][] {
    const groups: OpinionUnit[][] = [];

    const sortedUnits = units
      .slice()
      .sort((left, right) => right.engagementScore - left.engagementScore);

    // Inside each aboutness bucket, merge only when stance/type are compatible
    // and the normalized spans are similar enough to represent one opinion theme.
    for (const unit of sortedUnits) {
      const unitClusterType = inferClusterType(unit.stance, unit.intent, unit.noiseFlags);
      let bestGroupIndex = -1;
      let bestScore = 0;
      const mergeThreshold = unitClusterType === 'reaction_only' ? 0.05 : unitClusterType === 'question' ? 0.18 : 0.28;

      for (let index = 0; index < groups.length; index += 1) {
        const group = groups[index];
        const groupClusterType = inferClusterType(group[0].stance, group[0].intent, group[0].noiseFlags);
        if (!this.areClusterTypesCompatible(unitClusterType, groupClusterType)) {
          continue;
        }
        if (!this.areStancesCompatible(unit.stance, group[0].stance)) {
          continue;
        }

        const similarity = this.averageSimilarity(unit.normalizedText, group.map(item => item.normalizedText));
        if (similarity > bestScore) {
          bestScore = similarity;
          bestGroupIndex = index;
        }
      }

      if (bestGroupIndex >= 0 && bestScore >= mergeThreshold) {
        groups[bestGroupIndex].push(unit);
      } else {
        groups.push([unit]);
      }
    }

    return groups;
  }

  private finalizeLocalCluster(
    videoId: string,
    primaryAspectKey: string,
    primaryAspectLabel: string,
    anchorIds: string[],
    units: OpinionUnit[],
    enrichedByCommentId: Map<string, EnrichedComment>
  ): LocalCluster {
    const unitIds = units.map(unit => unit.opinionUnitId);
    const commentIds = Array.from(new Set(units.map(unit => unit.commentId)));
    const uniqueAuthors = new Set(units.map(unit => unit.authorId)).size;
    const totalEngagement = units.reduce((sum, unit) => sum + unit.engagementScore, 0);
    const averageGroundingConfidence = units.reduce((sum, unit) => sum + unit.groundingConfidence, 0) / Math.max(units.length, 1);
    const averageSemanticDensity = units.reduce((sum, unit) => sum + unit.semanticDensity, 0) / Math.max(units.length, 1);
    const replyDepthScore = commentIds.reduce(
      (sum, commentId) => sum + (enrichedByCommentId.get(commentId)?.depth || 0),
      0
    ) / Math.max(commentIds.length, 1);

    const stanceCounts = new Map<string, number>();
    const clusterTypeCounts = new Map<LocalClusterType, number>();

    for (const unit of units) {
      stanceCounts.set(unit.stance, (stanceCounts.get(unit.stance) || 0) + 1);
      const clusterType = inferClusterType(unit.stance, unit.intent, unit.noiseFlags);
      clusterTypeCounts.set(clusterType, (clusterTypeCounts.get(clusterType) || 0) + 1);
    }

    const dominantStance = this.pickDominantKey(stanceCounts, 'observation') as OpinionStance;
    const clusterType = this.pickDominantKey(clusterTypeCounts, 'opinion') as LocalClusterType;
    const representativeCommentIds = this.pickRepresentativeCommentIds(commentIds, units, enrichedByCommentId);
    const label = this.buildLocalClusterLabel(primaryAspectLabel, dominantStance, clusterType);
    const summary = this.buildLocalClusterSummary(primaryAspectLabel, dominantStance, clusterType, units.length);

    return {
      localClusterId: `${videoId}_${this.slug(primaryAspectKey)}_${clusterType}_${this.slug(dominantStance)}_${Math.max(commentIds.length, 1)}`,
      videoId,
      primaryAspectKey,
      primaryAspectLabel,
      anchorIds,
      stanceProfile: {
        dominant: dominantStance,
        distribution: Object.fromEntries(stanceCounts),
      },
      unitIds,
      commentIds,
      size: units.length,
      uniqueAuthors,
      totalEngagement: Number(totalEngagement.toFixed(3)),
      replyDepthScore: Number(replyDepthScore.toFixed(3)),
      averageGroundingConfidence: Number(averageGroundingConfidence.toFixed(3)),
      averageSemanticDensity: Number(averageSemanticDensity.toFixed(3)),
      importanceScore: 0,
      clusterType,
      label,
      summary,
      representativeCommentIds,
    };
  }

  private normalizeLocalClusterImportance(clusters: LocalCluster[]): LocalCluster[] {
    const commentCounts = clusters.map(cluster => cluster.commentIds.length);
    const authorCounts = clusters.map(cluster => cluster.uniqueAuthors);
    const engagements = clusters.map(cluster => cluster.totalEngagement);
    const replyDepths = clusters.map(cluster => cluster.replyDepthScore);
    const confidences = clusters.map(cluster => cluster.averageGroundingConfidence);
    const densities = clusters.map(cluster => cluster.averageSemanticDensity);

    // Importance is a ranking signal, not a semantic one. Engagement matters, but
    // it is balanced with author diversity, thread depth, grounding, and density.
    return clusters.map(cluster => {
      const importanceScore =
        0.2 * this.normalizeScalar(cluster.commentIds.length, commentCounts) +
        0.2 * this.normalizeScalar(cluster.uniqueAuthors, authorCounts) +
        0.2 * this.normalizeScalar(cluster.totalEngagement, engagements) +
        0.15 * this.normalizeScalar(cluster.replyDepthScore, replyDepths) +
        0.15 * this.normalizeScalar(cluster.averageGroundingConfidence, confidences) +
        0.1 * this.normalizeScalar(cluster.averageSemanticDensity, densities);

      return {
        ...cluster,
        importanceScore: Number(importanceScore.toFixed(3)),
      };
    });
  }

  private toLegacyClusters(localClusters: LocalCluster[], commentsById: Map<string, Comment>): CommentCluster[] {
    return localClusters.map((cluster, index) => ({
      id: index + 1,
      theme: cluster.label,
      sentiment: this.toLegacySentiment(cluster.stanceProfile.dominant),
      comments: cluster.commentIds
        .map(commentId => commentsById.get(commentId))
        .filter((comment): comment is Comment => Boolean(comment)),
      summary: cluster.summary,
      size: cluster.size,
    }));
  }

  private buildInsightsFromLocalClusters(videoId: string, localClusters: LocalCluster[]): Insight[] {
    return localClusters
      .filter(cluster =>
        cluster.clusterType !== 'spam' &&
        (cluster.clusterType === 'opinion' ||
          cluster.clusterType === 'question' ||
          cluster.clusterType === 'humor' ||
          cluster.size >= 3)
      )
      .slice(0, 5)
      .map((cluster, index) => ({
        insightId: `${videoId}_insight_${index + 1}`,
        scope: 'single_video',
        clusterIds: [cluster.localClusterId],
        title: cluster.label,
        description: cluster.summary,
        whyItMatters: this.buildWhyItMatters(cluster.clusterType, cluster.stanceProfile.dominant, false),
        supportingVideoIds: [videoId],
        supportingCommentIds: cluster.representativeCommentIds,
        supportingAnchors: cluster.anchorIds,
        importanceScore: cluster.importanceScore,
        confidence: cluster.averageGroundingConfidence,
      }));
  }

  private buildMetaClusters(localClusters: LocalCluster[], allVideoIds: string[], logs: string[]): MetaCluster[] {
    const accumulators: MetaClusterAccumulator[] = [];
    const eligibleClusters = localClusters
      .filter(cluster => cluster.clusterType !== 'spam')
      .sort((left, right) => right.importanceScore - left.importanceScore);

    // Compare local clusters instead of raw comments so the cross-video layer
    // operates on already-grounded themes rather than ambiguous snippets.
    for (const cluster of eligibleClusters) {
      const signatureText = `${cluster.primaryAspectLabel} ${cluster.label} ${cluster.summary}`;
      let bestAccumulatorIndex = -1;
      let bestScore = 0;

      for (let index = 0; index < accumulators.length; index += 1) {
        const candidate = accumulators[index];
        const existingVideos = new Set(candidate.localClusters.map(item => item.videoId));
        if (existingVideos.has(cluster.videoId)) {
          continue;
        }

        const stanceCompatible = this.areStancesCompatible(
          cluster.stanceProfile.dominant,
          candidate.localClusters[0].stanceProfile.dominant
        );
        if (!stanceCompatible) {
          continue;
        }

        const similarity = jaccardSimilarity(signatureText, candidate.signatureText);
        if (similarity > bestScore) {
          bestScore = similarity;
          bestAccumulatorIndex = index;
        }
      }

      if (bestAccumulatorIndex >= 0 && bestScore >= 0.24) {
        const accumulator = accumulators[bestAccumulatorIndex];
        accumulator.localClusters.push(cluster);
        accumulator.signatureText = `${accumulator.signatureText} ${signatureText}`;
      } else {
        accumulators.push({
          signatureText,
          localClusters: [cluster],
        });
      }
    }

    logs.push(`Created ${accumulators.length} meta-cluster candidates`);

    const metaClusters = accumulators
      .map((accumulator, index) =>
        this.finalizeMetaCluster(index + 1, accumulator.localClusters, allVideoIds.length)
      )
      .filter(cluster => cluster.coverage.videos > 1);

    return this.normalizeMetaClusterImportance(metaClusters)
      .sort((left, right) => right.importanceScore - left.importanceScore);
  }

  private finalizeMetaCluster(index: number, localClusters: LocalCluster[], totalVideos: number): MetaCluster {
    const videoIds = Array.from(new Set(localClusters.map(cluster => cluster.videoId)));
    const commentIds = Array.from(new Set(localClusters.flatMap(cluster => cluster.commentIds)));
    const representativeCommentIds = Array.from(
      new Set(localClusters.flatMap(cluster => cluster.representativeCommentIds))
    ).slice(0, 6);
    const stanceCounts = new Map<string, number>();
    const aspectCounts = new Map<string, number>();
    let totalUniqueAuthors = 0;
    let totalEngagement = 0;
    let totalGroundingConfidence = 0;

    for (const cluster of localClusters) {
      stanceCounts.set(cluster.stanceProfile.dominant, (stanceCounts.get(cluster.stanceProfile.dominant) || 0) + 1);
      aspectCounts.set(cluster.primaryAspectKey, (aspectCounts.get(cluster.primaryAspectKey) || 0) + 1);
      totalUniqueAuthors += cluster.uniqueAuthors;
      totalEngagement += cluster.totalEngagement;
      totalGroundingConfidence += cluster.averageGroundingConfidence;
    }

    const canonicalAspectKey = this.pickDominantKey(aspectCounts, localClusters[0]?.primaryAspectKey || 'discussion.general');
    const canonicalStance = this.pickDominantKey(stanceCounts, localClusters[0]?.stanceProfile.dominant || 'observation') as OpinionStance;
    const canonicalTheme = this.buildMetaTheme(localClusters, canonicalStance);
    const recurrenceScore = totalVideos > 0 ? videoIds.length / totalVideos : 0;
    const controversyScore = this.computeControversyScore(localClusters);
    const confidence = totalGroundingConfidence / Math.max(localClusters.length, 1);

    return {
      metaClusterId: `meta_cluster_${index}`,
      canonicalTheme,
      canonicalAspectKey,
      canonicalStance,
      localClusterIds: localClusters.map(cluster => cluster.localClusterId),
      videoIds,
      coverage: {
        videos: videoIds.length,
        comments: commentIds.length,
        uniqueAuthors: totalUniqueAuthors,
      },
      importanceScore: 0,
      recurrenceScore: Number(recurrenceScore.toFixed(3)),
      controversyScore: Number(controversyScore.toFixed(3)),
      confidence: Number(confidence.toFixed(3)),
      label: canonicalTheme,
      summary: this.buildMetaSummary(localClusters, canonicalTheme),
      representativeCommentIds,
    };
  }

  private normalizeMetaClusterImportance(metaClusters: MetaCluster[]): MetaCluster[] {
    const videoCoverage = metaClusters.map(cluster => cluster.coverage.videos);
    const commentCounts = metaClusters.map(cluster => cluster.coverage.comments);
    const uniqueAuthors = metaClusters.map(cluster => cluster.coverage.uniqueAuthors);
    const recurrence = metaClusters.map(cluster => cluster.recurrenceScore);
    const confidence = metaClusters.map(cluster => cluster.confidence);
    const controversy = metaClusters.map(cluster => cluster.controversyScore);

    // Cross-video importance prioritizes breadth and recurrence across videos,
    // then uses confidence and controversy to break ties.
    return metaClusters.map(cluster => {
      const importanceScore =
        0.25 * this.normalizeScalar(cluster.coverage.videos, videoCoverage) +
        0.2 * this.normalizeScalar(cluster.coverage.comments, commentCounts) +
        0.2 * this.normalizeScalar(cluster.coverage.uniqueAuthors, uniqueAuthors) +
        0.15 * this.normalizeScalar(cluster.recurrenceScore, recurrence) +
        0.1 * this.normalizeScalar(cluster.confidence, confidence) +
        0.1 * this.normalizeScalar(cluster.controversyScore, controversy);

      return {
        ...cluster,
        importanceScore: Number(importanceScore.toFixed(3)),
      };
    });
  }

  private buildInsightsFromMetaClusters(metaClusters: MetaCluster[]): Insight[] {
    return metaClusters.slice(0, 7).map((cluster, index) => ({
      insightId: `cross_video_insight_${index + 1}`,
      scope: 'cross_video',
      clusterIds: [cluster.metaClusterId],
      title: cluster.label,
      description: cluster.summary,
      whyItMatters: this.buildWhyItMatters('opinion', cluster.canonicalStance, true),
      supportingVideoIds: cluster.videoIds,
      supportingCommentIds: cluster.representativeCommentIds,
      supportingAnchors: [],
      importanceScore: cluster.importanceScore,
      confidence: cluster.confidence,
    }));
  }

  private buildAskLayerIndex(localClusters: LocalCluster[], metaClusters: MetaCluster[]): AskLayerIndex {
    const availableStances = Array.from(
      new Set([
        ...localClusters.map(cluster => cluster.stanceProfile.dominant),
        ...metaClusters.map(cluster => cluster.canonicalStance),
      ])
    );
    const availableClusterTypes = Array.from(new Set(localClusters.map(cluster => cluster.clusterType)));
    const availableAspectKeys = Array.from(
      new Set([
        ...localClusters.map(cluster => cluster.primaryAspectKey),
        ...metaClusters.map(cluster => cluster.canonicalAspectKey),
      ])
    );
    const availableIntents = Array.from(
      new Set(
        localClusters.map(cluster => {
          switch (cluster.clusterType) {
            case 'question':
              return 'information_request';
            case 'humor':
              return 'joke';
            case 'reaction_only':
              return 'reaction';
            default:
              return 'feedback';
          }
        })
      )
    );

    return {
      defaultScope: metaClusters.length > 0 ? 'cross_video' : 'single_video',
      defaultGrouping: ['aboutness', 'stance', 'importance'],
      availableScopes: metaClusters.length > 0 ? ['single_video', 'cross_video'] : ['single_video'],
      availableStances,
      availableIntents,
      availableClusterTypes,
      availableAspectKeys,
    };
  }

  private buildSingleVideoSummary(localClusters: LocalCluster[], insights: Insight[]): string {
    if (localClusters.length === 0) {
      return 'No meaningful local opinion clusters were identified.';
    }

    const topCluster = localClusters[0];
    const topInsight = insights[0];
    return [
      `Identified ${localClusters.length} local clusters for this video.`,
      `Top theme: ${topCluster.label}.`,
      topInsight ? `Primary insight: ${topInsight.description}` : '',
    ].filter(Boolean).join(' ');
  }

  private buildCrossVideoSummary(metaClusters: MetaCluster[], insights: Insight[], videoCount: number): string {
    if (metaClusters.length === 0) {
      return `Analyzed ${videoCount} videos but did not find recurring cross-video themes.`;
    }

    const topCluster = metaClusters[0];
    const topInsight = insights[0];
    return [
      `Built ${metaClusters.length} cross-video meta clusters across ${videoCount} videos.`,
      `Most recurring theme: ${topCluster.label}.`,
      topInsight ? `Top cross-video insight: ${topInsight.description}` : '',
    ].filter(Boolean).join(' ');
  }

  private pickRepresentativeCommentIds(
    commentIds: string[],
    units: OpinionUnit[],
    enrichedByCommentId: Map<string, EnrichedComment>
  ): string[] {
    const scores = new Map<string, number>();

    for (const commentId of commentIds) {
      const unitScore = units
        .filter(unit => unit.commentId === commentId)
        .reduce((sum, unit) => sum + unit.engagementScore + unit.semanticDensity, 0);
      const depthBonus = enrichedByCommentId.get(commentId)?.depth || 0;
      scores.set(commentId, unitScore + depthBonus * 0.1);
    }

    return Array.from(scores.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([commentId]) => commentId);
  }

  private buildLocalClusterLabel(aspectLabel: string, stance: OpinionStance, clusterType: LocalClusterType): string {
    switch (clusterType) {
      case 'question':
        return `Questions about ${aspectLabel}`;
      case 'humor':
        return `Humor about ${aspectLabel}`;
      case 'reaction_only':
        return `Reactions to ${aspectLabel}`;
      case 'spam':
        return `Spam around ${aspectLabel}`;
      case 'mixed_noise':
        return `Low-signal chatter about ${aspectLabel}`;
      default:
        switch (stance) {
          case 'positive':
            return `Praise for ${aspectLabel}`;
          case 'negative':
            return `Criticism of ${aspectLabel}`;
          case 'mixed':
            return `Mixed opinions on ${aspectLabel}`;
          case 'question':
            return `Questions about ${aspectLabel}`;
          default:
            return `Discussion about ${aspectLabel}`;
        }
    }
  }

  private buildLocalClusterSummary(
    aspectLabel: string,
    stance: OpinionStance,
    clusterType: LocalClusterType,
    size: number
  ): string {
    switch (clusterType) {
      case 'question':
        return `${size} opinion units ask for clarification or more detail about ${aspectLabel}.`;
      case 'humor':
        return `${size} opinion units react playfully or jokingly to ${aspectLabel}.`;
      case 'reaction_only':
        return `${size} low-context reactions concentrate around ${aspectLabel}.`;
      case 'spam':
        return `${size} low-value or promotional comments cluster around ${aspectLabel}.`;
      default:
        if (stance === 'negative') {
          return `${size} opinion units criticize or challenge ${aspectLabel}.`;
        }
        if (stance === 'positive') {
          return `${size} opinion units praise or endorse ${aspectLabel}.`;
        }
        if (stance === 'mixed') {
          return `${size} opinion units show split reactions to ${aspectLabel}.`;
        }
        return `${size} opinion units discuss ${aspectLabel}.`;
    }
  }

  private buildMetaTheme(localClusters: LocalCluster[], canonicalStance: OpinionStance): string {
    const anchorPhrase = localClusters[0]?.primaryAspectLabel || 'discussion';

    switch (canonicalStance) {
      case 'negative':
        return `Recurring criticism of ${anchorPhrase}`;
      case 'positive':
        return `Recurring praise for ${anchorPhrase}`;
      case 'question':
        return `Recurring questions about ${anchorPhrase}`;
      case 'mixed':
        return `Recurring mixed reactions to ${anchorPhrase}`;
      default:
        return `Recurring discussion about ${anchorPhrase}`;
    }
  }

  private buildMetaSummary(localClusters: LocalCluster[], canonicalTheme: string): string {
    const videoCount = new Set(localClusters.map(cluster => cluster.videoId)).size;
    return `${canonicalTheme} appears across ${videoCount} videos and is supported by ${localClusters.length} related local clusters.`;
  }

  private buildWhyItMatters(clusterType: LocalClusterType | 'opinion', stance: OpinionStance | 'mixed', crossVideo: boolean): string {
    if (clusterType === 'question') {
      return crossVideo
        ? 'The same unanswered questions recur across multiple videos, which suggests a repeatable information gap.'
        : 'These questions indicate where the video leaves viewers uncertain or under-informed.';
    }
    if (clusterType === 'reaction_only') {
      return crossVideo
        ? 'Even low-context reactions matter when they recur across videos, because they reveal consistent audience emotion.'
        : 'This cluster matters mainly as a mass reaction signal rather than a detailed opinion theme.';
    }
    if (stance === 'negative') {
      return crossVideo
        ? 'Repeated criticism across multiple videos is a stronger product or messaging signal than isolated pushback.'
        : 'Negative feedback often surfaces the clearest friction point for the audience.';
    }
    if (stance === 'positive') {
      return crossVideo
        ? 'Repeated praise across videos points to a durable strength or resonance pattern.'
        : 'Positive clusters help identify what the audience finds most compelling or useful.';
    }
    return crossVideo
      ? 'This recurring theme is useful because it shows a pattern that persists across videos rather than a one-off reaction.'
      : 'This cluster matters because it captures a coherent discussion theme inside the video.';
  }

  private computeControversyScore(localClusters: LocalCluster[]): number {
    const stances = new Set(localClusters.map(cluster => cluster.stanceProfile.dominant));
    const mixedSignals = stances.has('positive') && stances.has('negative') ? 1 : 0;
    const averageReplyDepth = localClusters.reduce((sum, cluster) => sum + cluster.replyDepthScore, 0) / Math.max(localClusters.length, 1);
    return Math.min(1, mixedSignals * 0.6 + averageReplyDepth * 0.15);
  }

  private averageSimilarity(text: string, candidates: string[]): number {
    if (candidates.length === 0) return 0;
    const total = candidates.reduce((sum, candidate) => sum + jaccardSimilarity(text, candidate), 0);
    return total / candidates.length;
  }

  private areClusterTypesCompatible(left: LocalClusterType, right: LocalClusterType): boolean {
    if (left === right) return true;
    if (left === 'opinion' && right === 'mixed_noise') return true;
    if (left === 'mixed_noise' && right === 'opinion') return true;
    return false;
  }

  private areStancesCompatible(left: OpinionStance, right: OpinionStance): boolean {
    if (left === right) return true;
    if ((left === 'observation' && right === 'mixed') || (left === 'mixed' && right === 'observation')) {
      return true;
    }
    return false;
  }

  private toLegacySentiment(stance: OpinionStance): CommentCluster['sentiment'] {
    switch (stance) {
      case 'positive':
        return 'positive';
      case 'negative':
        return 'negative';
      case 'mixed':
        return 'mixed';
      default:
        return 'neutral';
    }
  }

  private pickDominantKey<T extends string>(counts: Map<T, number>, fallback: T): T {
    let bestKey = fallback;
    let bestCount = -1;
    for (const [key, count] of counts.entries()) {
      if (count > bestCount) {
        bestKey = key;
        bestCount = count;
      }
    }
    return bestKey;
  }

  private normalizeScalar(value: number, allValues: number[]): number {
    if (allValues.length === 0) return 0;
    const minValue = Math.min(...allValues);
    const maxValue = Math.max(...allValues);
    if (maxValue === minValue) return 1;
    return (value - minValue) / (maxValue - minValue);
  }

  private slug(value: string): string {
    return normalizeForSimilarity(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'item';
  }
}
