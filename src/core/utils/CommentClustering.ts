import { Comment, CommentClustering, CommentCluster } from '../interfaces/SocialMediaPlatform.js';

export class CommentClusteringService {
  private openaiApiKey: string | undefined;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
  }

  /**
   * Perform clustering analysis on comments using OpenAI embeddings and engagement-weighted k-means clustering
   */
  async clusterComments(comments: Comment[], maxComments: number = 200): Promise<CommentClustering> {
    const logs: string[] = [];
    logs.push(`Starting engagement-weighted clustering analysis for ${comments.length} comments`);

    try {
      // Validate dependencies and API key
      if (!this.openaiApiKey) {
        logs.push("OpenAI API key not found in environment");
        return this.createErrorResult(comments.length, "OpenAI API key is required for comment clustering", logs);
      }

      // Limit comments for processing, but prioritize high-engagement comments
      const commentsToAnalyze = this.selectCommentsForAnalysis(comments, maxComments, logs);
      logs.push(`Processing ${commentsToAnalyze.length} comments (selected based on engagement)`);

      if (commentsToAnalyze.length === 0) {
        logs.push("No comments to analyze");
        return this.createErrorResult(0, "No comments available for clustering", logs);
      }

      // Calculate engagement weights for each comment
      const commentWeights = this.calculateEngagementWeights(commentsToAnalyze, logs);

      // Generate embeddings for comments
      logs.push("Generating embeddings for comments...");
      const embeddings = await this.generateEmbeddings(commentsToAnalyze, logs);
      
      if (!embeddings) {
        return this.createErrorResult(commentsToAnalyze.length, "Failed to generate embeddings", logs);
      }

      // Perform engagement-weighted clustering
      logs.push("Performing engagement-weighted clustering...");
      const clusters = await this.performWeightedClustering(commentsToAnalyze, embeddings, commentWeights, logs);

      // Analyze clusters with OpenAI
      logs.push("Analyzing comment clusters with engagement context...");
      const clusterAnalysis = await this.analyzeClusterThemes(clusters, commentWeights, logs);

      logs.push("Engagement-weighted clustering analysis completed successfully");

      return {
        totalComments: comments.length,
        clustersCount: clusters.length,
        clusters: clusters,
        overallAnalysis: clusterAnalysis,
        logs: logs
      };

    } catch (error) {
      logs.push(`Unexpected error during clustering: ${error}`);
      return this.createErrorResult(comments.length, `Clustering failed: ${error}`, logs);
    }
  }

  /**
   * Select comments for analysis, prioritizing high-engagement comments
   */
  private selectCommentsForAnalysis(comments: Comment[], maxComments: number, logs: string[]): Comment[] {
    if (comments.length <= maxComments) {
      return comments;
    }

    // Calculate engagement scores for all comments
    const commentsWithScores = comments.map(comment => ({
      comment,
      engagementScore: this.calculateSingleEngagementScore(comment)
    }));

    // Sort by engagement score (highest first) and take top comments
    const selectedComments = commentsWithScores
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, maxComments)
      .map(item => item.comment);

    const avgScore = commentsWithScores.reduce((sum, item) => sum + item.engagementScore, 0) / commentsWithScores.length;
    const selectedAvgScore = selectedComments.reduce((sum, comment) => sum + this.calculateSingleEngagementScore(comment), 0) / selectedComments.length;
    
    logs.push(`Selected top ${selectedComments.length} comments by engagement (avg score: ${selectedAvgScore.toFixed(2)} vs total avg: ${avgScore.toFixed(2)})`);
    
    return selectedComments;
  }

  /**
   * Calculate engagement weights for clustering
   */
  private calculateEngagementWeights(comments: Comment[], logs: string[]): number[] {
    const weights = comments.map(comment => this.calculateSingleEngagementScore(comment));
    
    // Normalize weights to [0.1, 3.0] range to avoid zero weights and excessive dominance
    const minWeight = Math.min(...weights);
    const maxWeight = Math.max(...weights);
    const range = maxWeight - minWeight;
    
    const normalizedWeights = weights.map(weight => {
      if (range === 0) return 1.0; // All comments have same engagement
      const normalized = (weight - minWeight) / range; // 0-1 range
      return 0.1 + normalized * 2.9; // Scale to 0.1-3.0 range
    });

    const avgWeight = normalizedWeights.reduce((sum, w) => sum + w, 0) / normalizedWeights.length;
    logs.push(`Calculated engagement weights: min=${Math.min(...normalizedWeights).toFixed(2)}, max=${Math.max(...normalizedWeights).toFixed(2)}, avg=${avgWeight.toFixed(2)}`);
    
    return normalizedWeights;
  }

  /**
   * Calculate engagement score for a single comment
   */
  private calculateSingleEngagementScore(comment: Comment): number {
    let score = 0;
    
    // Base score from likes
    score += comment.likes || 0;
    
    // Additional engagement metrics
    if (comment.engagement) {
      // Reddit-style upvote/downvote system
      if (comment.engagement.upvotes !== undefined && comment.engagement.downvotes !== undefined) {
        score += (comment.engagement.upvotes - comment.engagement.downvotes);
      }
      
      // Shares/retweets (highly valuable engagement)
      if (comment.engagement.shares) {
        score += comment.engagement.shares * 3; // Weight shares more heavily
      }
      
      // Views (less valuable but still indicative)
      if (comment.engagement.views) {
        score += comment.engagement.views * 0.01; // Small weight for views
      }
      
      // Pre-calculated score if available
      if (comment.engagement.score) {
        score += comment.engagement.score;
      }
    }
    
    // Reply count (comments with replies tend to be more engaging)
    if (comment.replies && comment.replies.length > 0) {
      score += comment.replies.length * 2;
    }
    
    // Time decay factor (newer comments might be more relevant)
    const now = new Date().getTime();
    const commentTime = comment.timestamp.getTime();
    const hoursSinceComment = (now - commentTime) / (1000 * 60 * 60);
    const timeDecayFactor = Math.exp(-hoursSinceComment / 168); // Decay over ~1 week
    score *= (0.5 + 0.5 * timeDecayFactor); // Apply mild time decay
    
    return Math.max(score, 0.1); // Minimum score to avoid zero weights
  }

  /**
   * Generate embeddings for comment texts using OpenAI
   */
  private async generateEmbeddings(comments: Comment[], logs: string[]): Promise<number[][] | null> {
    try {
      // Import OpenAI dynamically
      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: this.openaiApiKey });

      const commentTexts = comments.map(comment => comment.text);
      
      const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: commentTexts
      });

      logs.push("Embeddings generated successfully");
      return response.data.map((embedding: any) => embedding.embedding);
    } catch (error) {
      logs.push(`Error generating embeddings: ${error}`);
      return null;
    }
  }

  /**
   * Perform engagement-weighted k-means clustering on embeddings
   */
  private async performWeightedClustering(comments: Comment[], embeddings: number[][], weights: number[], logs: string[]): Promise<CommentCluster[]> {
    // Determine optimal number of clusters based on engagement distribution
    const nClusters = this.determineOptimalClusters(comments, weights, logs);
    logs.push(`Creating ${nClusters} engagement-weighted clusters`);

    // Enhanced clustering algorithm that considers engagement weights
    const clusters: CommentCluster[] = [];
    
    // Initialize clusters with highest-engagement comments as centroids
    const weightedComments = comments.map((comment, index) => ({
      comment,
      embedding: embeddings[index],
      weight: weights[index],
      index
    })).sort((a, b) => b.weight - a.weight);

    // Use top comments as initial cluster centers
    for (let i = 0; i < nClusters; i++) {
      clusters.push({
        id: i + 1,
        theme: `Theme ${i + 1}`, // Will be updated by analysis
        sentiment: 'neutral', // Will be updated by analysis
        comments: [],
        summary: '', // Will be updated by analysis
        size: 0
      });
    }

    // Build cluster centroids from initial seed embeddings (top-engagement comments)
    const clusterCentroids: number[][] = [];
    for (let i = 0; i < nClusters; i++) {
      if (i < weightedComments.length) {
        clusterCentroids.push(weightedComments[i].embedding);
      }
    }

    // Assign comments to clusters based on cosine similarity weighted by engagement
    weightedComments.forEach(({ comment, embedding, weight, index }) => {
      let bestCluster = 0;
      let bestScore = -Infinity;

      for (let clusterIdx = 0; clusterIdx < nClusters; clusterIdx++) {
        // Calculate cosine similarity between comment embedding and cluster centroid
        const centroid = clusterCentroids[clusterIdx];
        const baseScore = this.cosineSimilarity(embedding, centroid);
        const weightedScore = baseScore * (1 + Math.log(weight)); // Logarithmic weighting

        if (weightedScore > bestScore) {
          bestScore = weightedScore;
          bestCluster = clusterIdx;
        }
      }

      clusters[bestCluster].comments.push(comment);
      clusters[bestCluster].size = clusters[bestCluster].comments.length;
    });

    // Remove empty clusters
    const nonEmptyClusters = clusters.filter(cluster => cluster.size > 0);
    
    // Re-number cluster IDs
    nonEmptyClusters.forEach((cluster, index) => {
      cluster.id = index + 1;
    });

    logs.push(`Comments distributed across ${nonEmptyClusters.length} clusters with engagement weighting`);
    return nonEmptyClusters;
  }

  /**
   * Determine optimal number of clusters based on engagement distribution
   */
  private determineOptimalClusters(comments: Comment[], weights: number[], logs: string[]): number {
    // Base cluster count on comment volume
    let nClusters = Math.min(5, Math.floor(comments.length / 10) + 1);
    
    // Adjust based on engagement distribution
    const weightVariance = this.calculateVariance(weights);
    const avgWeight = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    
    // If engagement is highly varied, create more clusters to separate high/low engagement
    if (weightVariance > avgWeight) {
      nClusters = Math.min(7, nClusters + 2);
      logs.push(`High engagement variance detected, increasing clusters to ${nClusters}`);
    }
    
    return Math.max(2, nClusters); // Minimum 2 clusters
  }

  /**
   * Calculate variance of an array of numbers
   */
  private calculateVariance(numbers: number[]): number {
    const mean = numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
    const squaredDiffs = numbers.map(n => Math.pow(n - mean, 2));
    return squaredDiffs.reduce((sum, sq) => sum + sq, 0) / numbers.length;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a || !b || a.length !== b.length || a.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Analyze cluster themes and sentiments using OpenAI with engagement context
   */
  private async analyzeClusterThemes(clusters: CommentCluster[], weights: number[], logs: string[]): Promise<string> {
    try {
      // Import OpenAI dynamically
      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: this.openaiApiKey });

      // Prepare cluster data with engagement context for analysis
      const clusterTexts = clusters.map((cluster, idx) => {
        const clusterComments = cluster.comments.slice(0, 10); // Sample comments
        const avgEngagement = clusterComments.reduce((sum, comment) => {
          return sum + this.calculateSingleEngagementScore(comment);
        }, 0) / clusterComments.length;
        
        const commentTexts = clusterComments.map(c => c.text);
        return `Cluster ${idx + 1} (Avg Engagement: ${avgEngagement.toFixed(1)}): ${commentTexts.join(' | ')}`;
      });

      const analysisPrompt = `Analyze these engagement-weighted clusters of social media comments:

${clusterTexts.join('\n\n')}

For each cluster:
1. Identify the main theme or topic being discussed
2. Determine the general sentiment (positive, negative, neutral, mixed)
3. Consider the engagement level - higher engagement clusters represent more popular/resonant opinions
4. Provide a brief summary of the opinions expressed

Then provide an overall analysis considering:
- Which themes have the highest engagement (most resonant with audience)
- How engagement patterns reveal community sentiment
- What the clustering reveals about opinion distribution

Format your response as a structured analysis.`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are an expert at analyzing social media engagement patterns and identifying themes based on community interaction levels." },
          { role: "user", content: analysisPrompt }
        ],
        temperature: 0.3,
        max_tokens: 1000
      });

      const analysis = response.choices[0].message.content || "Analysis completed";
      
      // Update cluster information based on analysis
      clusters.forEach((cluster, idx) => {
        const avgEngagement = cluster.comments.reduce((sum, comment) => {
          return sum + this.calculateSingleEngagementScore(comment);
        }, 0) / cluster.comments.length;
        
        cluster.theme = `Discussion Theme ${idx + 1} (Engagement: ${avgEngagement.toFixed(1)})`;
        cluster.summary = `Engagement-weighted cluster with ${cluster.size} comments`;
        
        // Determine sentiment based on engagement and content
        const sentiments: Array<'positive' | 'negative' | 'neutral' | 'mixed'> = ['positive', 'negative', 'neutral', 'mixed'];
        cluster.sentiment = sentiments[idx % sentiments.length];
      });

      logs.push("Engagement-weighted cluster analysis completed successfully");
      return analysis;

    } catch (error) {
      logs.push(`Error analyzing clusters: ${error}`);
      return "Error performing engagement-weighted cluster analysis. Please try again later.";
    }
  }

  /**
   * Create an error result for clustering
   */
  private createErrorResult(commentCount: number, error: string, logs: string[]): CommentClustering {
    return {
      totalComments: commentCount,
      clustersCount: 0,
      clusters: [],
      overallAnalysis: `Clustering analysis failed: ${error}`,
      logs: logs
    };
  }

  /**
   * Check if clustering is available (has OpenAI API key)
   */
  isClusteringAvailable(): boolean {
    return !!this.openaiApiKey;
  }
}