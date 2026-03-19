import OpenAI from 'openai';
import { uniqueTokens } from './CommentAnalysisUtils.js';

export interface EmbeddingBatchResult {
  vectors: number[][];
  provider: 'openai' | 'hash_fallback';
  model: string;
  dimensions: number;
  logs: string[];
}

export class CommentEmbeddingService {
  private client?: OpenAI;
  private readonly remoteModel: string;
  private readonly fallbackDimensions: number;

  constructor() {
    this.remoteModel = process.env.COMMENT_EMBEDDING_MODEL || 'text-embedding-3-small';
    this.fallbackDimensions = Number(process.env.COMMENT_EMBEDDING_FALLBACK_DIMENSIONS || 128);

    if (process.env.OPENAI_API_KEY) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }

  async embedTexts(texts: string[]): Promise<EmbeddingBatchResult> {
    if (texts.length === 0) {
      return {
        vectors: [],
        provider: this.client ? 'openai' : 'hash_fallback',
        model: this.client ? this.remoteModel : 'hash-fallback-v1',
        dimensions: this.client ? 0 : this.fallbackDimensions,
        logs: ['No texts provided for embedding'],
      };
    }

    if (this.client) {
      try {
        const response = await this.client.embeddings.create({
          model: this.remoteModel,
          input: texts,
        });

        return {
          vectors: response.data.map(item => item.embedding),
          provider: 'openai',
          model: this.remoteModel,
          dimensions: response.data[0]?.embedding.length || 0,
          logs: [`Embedded ${texts.length} texts with OpenAI model ${this.remoteModel}`],
        };
      } catch (error) {
        return {
          vectors: this.buildHashFallbackEmbeddings(texts),
          provider: 'hash_fallback',
          model: 'hash-fallback-v1',
          dimensions: this.fallbackDimensions,
          logs: [
            `OpenAI embeddings failed; falling back to deterministic hash embeddings: ${error}`,
            `Embedded ${texts.length} texts with deterministic hash fallback`,
          ],
        };
      }
    }

    return {
      vectors: this.buildHashFallbackEmbeddings(texts),
      provider: 'hash_fallback',
      model: 'hash-fallback-v1',
      dimensions: this.fallbackDimensions,
      logs: [`Embedded ${texts.length} texts with deterministic hash fallback`],
    };
  }

  cosineSimilarity(left: number[], right: number[]): number {
    if (left.length === 0 || right.length === 0 || left.length !== right.length) {
      return 0;
    }

    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;

    for (let index = 0; index < left.length; index += 1) {
      dot += left[index] * right[index];
      leftNorm += left[index] * left[index];
      rightNorm += right[index] * right[index];
    }

    if (leftNorm === 0 || rightNorm === 0) {
      return 0;
    }

    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
  }

  averageVectors(vectors: number[][]): number[] {
    if (vectors.length === 0) {
      return [];
    }

    const dimensions = vectors[0].length;
    const average = new Array<number>(dimensions).fill(0);

    for (const vector of vectors) {
      for (let index = 0; index < dimensions; index += 1) {
        average[index] += vector[index];
      }
    }

    for (let index = 0; index < dimensions; index += 1) {
      average[index] /= vectors.length;
    }

    return this.normalizeVector(average);
  }

  private buildHashFallbackEmbeddings(texts: string[]): number[][] {
    return texts.map(text => {
      const vector = new Array<number>(this.fallbackDimensions).fill(0);
      const tokens = uniqueTokens(text);

      for (const token of tokens) {
        const index = this.hashToken(token, 17) % this.fallbackDimensions;
        const sign = this.hashToken(token, 31) % 2 === 0 ? 1 : -1;
        const secondaryIndex = this.hashToken(token, 53) % this.fallbackDimensions;

        vector[index] += sign;
        vector[secondaryIndex] += sign * 0.5;
      }

      return this.normalizeVector(vector);
    });
  }

  private normalizeVector(vector: number[]): number[] {
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (norm === 0) {
      return vector;
    }
    return vector.map(value => value / norm);
  }

  private hashToken(token: string, seed: number): number {
    let hash = seed;
    for (let index = 0; index < token.length; index += 1) {
      hash = ((hash << 5) - hash + token.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
  }
}
