import type { Comment, ContentAnalysis, Post } from '../interfaces/SocialMediaPlatform.js';
import type { AskLayerIndex, Insight, MetaCluster } from '../interfaces/CommentAnalysis.js';
import type { VideoContext } from './VideoUnderstanding.js';
import { CommentClusteringService } from './CommentClustering.js';
import { CommentEnricherService } from './CommentEnricher.js';
import { TikTokUrlUtils } from './TikTokUrlUtils.js';
import { VideoDownloaderService } from './VideoDownloader.js';
import { VideoUnderstandingService } from './VideoUnderstanding.js';

export interface TikTokVideoAnalysisInput {
  contentId: string;
  comments: Comment[];
  post?: Post;
  searchKeyword?: string;
  maxComments?: number;
}

export interface TikTokCrossVideoAnalysisResult {
  query: string;
  videosAnalyzed: number;
  perVideo: ContentAnalysis[];
  metaClusters: MetaCluster[];
  insights: Insight[];
  askLayerIndex: AskLayerIndex;
  overallAnalysis: string;
  logs: string[];
}

export class TikTokCommentAnalysisService {
  private downloader: VideoDownloaderService;
  private videoUnderstanding: VideoUnderstandingService;
  private enricher: CommentEnricherService;
  private clustering: CommentClusteringService;

  constructor() {
    this.downloader = new VideoDownloaderService();
    this.videoUnderstanding = new VideoUnderstandingService();
    this.enricher = new CommentEnricherService();
    this.clustering = new CommentClusteringService();
  }

  async analyzeVideo(input: TikTokVideoAnalysisInput): Promise<ContentAnalysis> {
    const logs: string[] = [];
    const videoId = this.normalizeVideoId(input.contentId);
    const comments = input.comments.slice(0, input.maxComments || input.comments.length || 200);
    const sourceUrl = this.resolveSourceUrl(input.contentId, input.post);
    let videoContext: VideoContext | undefined;
    let videoPipelineStatus = 'comment_only';

    if (sourceUrl) {
      try {
        logs.push(`Starting TikTok video pipeline for ${videoId}`);
        const download = await this.downloader.downloadVideo(sourceUrl, {
          maxHeight: 480,
          useChromecookies: true,
          maxDurationSeconds: 1200,
        });

        try {
          // Build a structured video context first so downstream comment enrichment
          // can ground vague references against moments, quotes, and entities.
          videoContext = await this.videoUnderstanding.understandVideo(
            download.filePath,
            videoId,
            input.searchKeyword || input.post?.content || 'TikTok analysis'
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
      logs.push(`No TikTok URL available for ${videoId}; running comment-only enrichment`);
    }

    const enrichment = this.enricher.enrichComments(videoId, comments, videoContext);
    const clustering = await this.clustering.clusterSingleVideo({
      videoId,
      comments,
      enrichment,
      videoContext,
    });

    const sentiment = this.inferSentiment(clustering.localClusters || []);
    const themes = (clustering.localClusters || []).slice(0, 5).map(cluster => cluster.label);
    const summary = clustering.insights?.[0]?.description || clustering.overallAnalysis;

    const analysis: ContentAnalysis = {
      postId: videoId,
      platform: 'tiktok',
      sentiment,
      themes,
      summary,
      commentCount: enrichment.flattenedComments.length,
      topComments: comments.slice(0, 5),
      clustering,
      enrichedComments: clustering.enrichedComments,
      opinionUnits: clustering.opinionUnits,
      videoAnchors: clustering.videoAnchors,
      localClusters: clustering.localClusters,
      metaClusters: clustering.metaClusters,
      insights: clustering.insights,
      askLayerIndex: clustering.askLayerIndex,
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
  ): Promise<TikTokCrossVideoAnalysisResult> {
    const logs: string[] = [];
    const perVideo: ContentAnalysis[] = [];

    // Build each video's grounded local view first, then merge those views into
    // cross-video meta clusters.
    for (const post of posts) {
      try {
        logs.push(`Analyzing TikTok post ${post.id}`);
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

    // Videos that never reached the clustering step are skipped from the
    // cross-video layer so one failed download does not block the rest.
    const clusterings = perVideo
      .map(analysis => ({
        videoId: analysis.postId,
        clustering: analysis.clustering,
        videoContext: analysis.videoContext as VideoContext | undefined,
      }))
      .filter(
        (item): item is {
          videoId: string;
          clustering: NonNullable<ContentAnalysis['clustering']>;
          videoContext: VideoContext | undefined;
        } => Boolean(item.clustering)
      );

    const crossVideo = await this.clustering.buildCrossVideoClustering({
      videoIds: perVideo.map(analysis => analysis.postId),
      clusterings,
    });

    logs.push(...crossVideo.logs);

    return {
      query,
      videosAnalyzed: perVideo.length,
      perVideo,
      metaClusters: crossVideo.metaClusters || [],
      insights: crossVideo.insights || [],
      askLayerIndex: crossVideo.askLayerIndex || {
        defaultScope: 'cross_video',
        defaultGrouping: ['aboutness', 'stance', 'importance'],
        availableScopes: ['cross_video'],
        availableStances: [],
        availableIntents: [],
        availableClusterTypes: [],
        availableAspectKeys: [],
      },
      overallAnalysis: crossVideo.overallAnalysis,
      logs,
    };
  }

  private normalizeVideoId(contentId: string): string {
    if (TikTokUrlUtils.isTikTokUrl(contentId)) {
      return TikTokUrlUtils.extractVideoId(contentId) || contentId;
    }
    return contentId;
  }

  private resolveSourceUrl(contentId: string, post?: Post): string | undefined {
    if (post?.url && TikTokUrlUtils.isTikTokUrl(post.url)) {
      return post.url;
    }
    if (TikTokUrlUtils.isTikTokUrl(contentId)) {
      return contentId;
    }
    return undefined;
  }

  private inferSentiment(localClusters: ContentAnalysis['localClusters']): 'positive' | 'negative' | 'neutral' {
    if (!localClusters || localClusters.length === 0) {
      return 'neutral';
    }

    const topCluster = localClusters[0];
    if (topCluster.stanceProfile.dominant === 'positive') return 'positive';
    if (topCluster.stanceProfile.dominant === 'negative') return 'negative';
    return 'neutral';
  }
}
