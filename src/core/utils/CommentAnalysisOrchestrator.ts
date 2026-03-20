import type { Comment, ContentAnalysis, Post, CommentClustering } from '../interfaces/SocialMediaPlatform.js';
import type { AskLayerIndex, Insight, MetaCluster } from '../interfaces/CommentAnalysis.js';
import type { VideoContext } from './VideoUnderstanding.js';
import { CommentClusteringService } from './CommentClustering.js';
import { CommentEnricherService } from './CommentEnricher.js';
import { VideoDownloaderService } from './VideoDownloader.js';
import { VideoUnderstandingService } from './VideoUnderstanding.js';

/**
 * Platform-specific configuration for the video analysis orchestrator.
 * Each platform provides URL detection, content ID extraction, and URL resolution.
 */
export interface PlatformVideoConfig {
  platformName: string;
  isVideoUrl: (input: string) => boolean;
  extractContentId: (input: string) => string | null;
  resolveUrl: (input: string) => Promise<string>;
  buildSourceUrl?: (contentId: string, post?: Post) => string | undefined;
}

export interface VideoAnalysisInput {
  contentId: string;
  comments: Comment[];
  post?: Post;
  searchKeyword?: string;
  maxComments?: number;
}

export interface CrossVideoAnalysisResult {
  query: string;
  videosAnalyzed: number;
  perVideo: ContentAnalysis[];
  metaClusters: MetaCluster[];
  insights: Insight[];
  askLayerIndex: AskLayerIndex;
  overallAnalysis: string;
  logs: string[];
}

/**
 * Platform-agnostic orchestrator for video comment analysis.
 *
 * Handles the full pipeline: video download → VLM understanding → comment enrichment → clustering.
 * Platform-specific URL handling is delegated to the PlatformVideoConfig.
 */
export class CommentAnalysisOrchestrator {
  private config: PlatformVideoConfig;
  private downloader: VideoDownloaderService;
  private videoUnderstanding: VideoUnderstandingService;
  private enricher: CommentEnricherService;
  private clustering: CommentClusteringService;

  constructor(config: PlatformVideoConfig) {
    this.config = config;
    this.downloader = new VideoDownloaderService();
    this.videoUnderstanding = new VideoUnderstandingService();
    this.enricher = new CommentEnricherService();
    this.clustering = new CommentClusteringService();
  }

  async analyzeVideo(input: VideoAnalysisInput): Promise<ContentAnalysis> {
    const logs: string[] = [];
    const videoId = this.normalizeVideoId(input.contentId);
    const comments = input.comments.slice(0, input.maxComments || input.comments.length || 200);
    const sourceUrl = this.resolveSourceUrl(input.contentId, input.post);
    let videoContext: VideoContext | undefined;
    let videoPipelineStatus = 'comment_only';

    if (sourceUrl) {
      try {
        logs.push(`Starting ${this.config.platformName} video pipeline for ${videoId}`);
        const download = await this.downloader.downloadVideo(sourceUrl, {
          maxHeight: 480,
          useChromecookies: true,
          maxDurationSeconds: 1200,
        });

        try {
          videoContext = await this.videoUnderstanding.understandVideo(
            download.filePath,
            videoId,
            input.searchKeyword || input.post?.content || `${this.config.platformName} analysis`
          );
          videoPipelineStatus = 'video_context_ready';
          logs.push(`Video context created for ${videoId}`);
        } finally {
          this.downloader.cleanup(download.filePath);
        }
      } catch (error) {
        videoPipelineStatus = 'video_pipeline_failed';
        logs.push(`Video pipeline unavailable for ${videoId}: ${error}`);
      }
    } else {
      logs.push(`No ${this.config.platformName} URL available for ${videoId}; running comment-only enrichment`);
    }

    // Enrich comments with video context (anchors, opinion units)
    const enrichment = this.enricher.enrichComments(videoId, comments, videoContext);

    // Cluster the comments semantically
    const clusteringResult = await this.clustering.clusterComments(comments, 200);

    // Merge enrichment data into the clustering result for a unified output
    const mergedClustering: CommentClustering = {
      ...clusteringResult,
      enrichedComments: enrichment.enrichedComments,
      opinionUnits: enrichment.opinionUnits,
      videoAnchors: enrichment.videoAnchors,
    };

    const sentiment = this.inferSentimentFromClusters(clusteringResult);
    const themes = clusteringResult.clusters.slice(0, 5).map(cluster => cluster.theme);
    const summary = clusteringResult.overallAnalysis;

    const analysis: ContentAnalysis = {
      postId: videoId,
      platform: this.config.platformName as ContentAnalysis['platform'],
      sentiment,
      themes,
      summary,
      commentCount: enrichment.flattenedComments.length,
      topComments: comments.slice(0, 5),
      clustering: mergedClustering,
      enrichedComments: enrichment.enrichedComments,
      opinionUnits: enrichment.opinionUnits,
      videoAnchors: enrichment.videoAnchors,
      videoContext: videoContext as unknown as Record<string, unknown>,
      analysisMetadata: {
        sourceUrl,
        videoPipelineStatus,
        logs,
      },
    };

    return analysis;
  }

  async analyzePosts(
    query: string,
    posts: Post[],
    fetchComments: (postId: string, limit: number) => Promise<Comment[]>,
    maxCommentsPerVideo: number = 120
  ): Promise<CrossVideoAnalysisResult> {
    const logs: string[] = [];
    const perVideo: ContentAnalysis[] = [];

    for (const post of posts) {
      try {
        logs.push(`Analyzing ${this.config.platformName} post ${post.id}`);
        const comments = await fetchComments(post.id, maxCommentsPerVideo);
        const analysis = await this.analyzeVideo({
          contentId: post.url || post.id,
          comments,
          post,
          searchKeyword: query,
          maxComments: maxCommentsPerVideo,
        });
        perVideo.push(analysis);
      } catch (error) {
        logs.push(`Failed to analyze ${post.id}: ${error}`);
      }
    }

    // Aggregate all comments across videos for cross-video clustering
    const allComments = perVideo.flatMap(a => a.topComments || []);
    let crossVideoAnalysis = '';
    if (allComments.length > 0) {
      const crossClustering = await this.clustering.clusterComments(allComments, 200);
      crossVideoAnalysis = crossClustering.overallAnalysis;
      logs.push(`Cross-video clustering: ${crossClustering.clustersCount} clusters from ${crossClustering.totalComments} comments`);
    }

    return {
      query,
      videosAnalyzed: perVideo.length,
      perVideo,
      metaClusters: [],
      insights: [],
      askLayerIndex: {
        defaultScope: 'cross_video',
        defaultGrouping: ['aboutness', 'stance', 'importance'],
        availableScopes: ['cross_video'],
        availableStances: [],
        availableIntents: [],
        availableClusterTypes: [],
        availableAspectKeys: [],
      },
      overallAnalysis: crossVideoAnalysis,
      logs,
    };
  }

  private normalizeVideoId(contentId: string): string {
    if (this.config.isVideoUrl(contentId)) {
      return this.config.extractContentId(contentId) || contentId;
    }
    return contentId;
  }

  private resolveSourceUrl(contentId: string, post?: Post): string | undefined {
    if (this.config.buildSourceUrl) {
      return this.config.buildSourceUrl(contentId, post);
    }
    if (post?.url && this.config.isVideoUrl(post.url)) {
      return post.url;
    }
    if (this.config.isVideoUrl(contentId)) {
      return contentId;
    }
    return undefined;
  }

  private inferSentimentFromClusters(clustering: CommentClustering): 'positive' | 'negative' | 'neutral' {
    if (!clustering.clusters || clustering.clusters.length === 0) {
      return 'neutral';
    }

    // Use the largest cluster's sentiment as the overall sentiment
    const sorted = [...clustering.clusters].sort((a, b) => b.size - a.size);
    const dominant = sorted[0]?.sentiment;
    if (dominant === 'positive') return 'positive';
    if (dominant === 'negative') return 'negative';
    return 'neutral';
  }
}
