#!/usr/bin/env node

/**
 * CrowdListen CLI
 * Fast, token-efficient social media intelligence for AI agents.
 * JSON output to stdout, errors to stderr. Exit 0 = success, 1 = error.
 */

import { Command } from 'commander';
import { createService } from './service-config.js';
import {
  searchContent,
  getContentComments,
  analyzeContent,
  clusterOpinions,
  getTrendingContent,
  getUserContent,
  getPlatformStatus,
  healthCheck,
} from './handlers.js';

const program = new Command();

program
  .name('crowdlisten')
  .description('Social media intelligence CLI for AI agents')
  .version('1.0.0');

// Shared service instance — initialized lazily
let service: ReturnType<typeof createService> | null = null;
let initialized = false;

async function getService() {
  if (!service) {
    service = createService();
  }
  if (!initialized) {
    const results = await service.initialize();
    const ok = Object.entries(results).filter(([, s]) => s).map(([p]) => p);
    if (ok.length === 0) {
      console.error('Error: No platforms initialized successfully');
      process.exit(1);
    }
    console.error(`[crowdlisten] Platforms: ${ok.join(', ')}`);
    initialized = true;
  }
  return service;
}

function output(data: any) {
  console.log(JSON.stringify(data, null, 2));
}

async function run(fn: () => Promise<any>) {
  try {
    const result = await fn();
    output(result);
    process.exit(0);
  } catch (err: any) {
    console.error(`Error: ${err.message || err}`);
    process.exit(1);
  }
}

// --- Commands ---

program
  .command('search <platform> <query>')
  .description('Search social media for audience conversations')
  .option('-l, --limit <n>', 'Max results', '10')
  .action(async (platform: string, query: string, opts: any) => {
    await run(async () => {
      const svc = await getService();
      return searchContent(svc, { platform, query, limit: parseInt(opts.limit) });
    });
  });

program
  .command('comments <platform> <contentId>')
  .description('Get comments for a specific post/video')
  .option('-l, --limit <n>', 'Max comments', '20')
  .action(async (platform: string, contentId: string, opts: any) => {
    await run(async () => {
      const svc = await getService();
      return getContentComments(svc, { platform, contentId, limit: parseInt(opts.limit) });
    });
  });

program
  .command('analyze <platform> <contentId>')
  .description('Full analysis pipeline: comments + clustering + sentiment')
  .option('-d, --depth <level>', 'Analysis depth (surface|standard|deep|comprehensive)', 'standard')
  .option('--no-clustering', 'Disable opinion clustering')
  .action(async (platform: string, contentId: string, opts: any) => {
    await run(async () => {
      const svc = await getService();
      return analyzeContent(svc, {
        platform,
        contentId,
        analysisDepth: opts.depth,
        enableClustering: opts.clustering !== false,
      });
    });
  });

program
  .command('cluster <platform> <contentId>')
  .description('Cluster opinions from comments using embeddings')
  .option('-n, --clusters <n>', 'Number of clusters', '5')
  .option('--no-examples', 'Exclude example comments')
  .action(async (platform: string, contentId: string, opts: any) => {
    await run(async () => {
      const svc = await getService();
      return clusterOpinions(svc, {
        platform,
        contentId,
        clusterCount: parseInt(opts.clusters),
        includeExamples: opts.examples !== false,
        weightByEngagement: true,
      });
    });
  });

program
  .command('trending <platform>')
  .description('Get trending content from a platform')
  .option('-l, --limit <n>', 'Max results', '10')
  .action(async (platform: string, opts: any) => {
    await run(async () => {
      const svc = await getService();
      return getTrendingContent(svc, { platform, limit: parseInt(opts.limit) });
    });
  });

program
  .command('user <platform> <userId>')
  .description('Get content from a specific user')
  .option('-l, --limit <n>', 'Max results', '10')
  .action(async (platform: string, userId: string, opts: any) => {
    await run(async () => {
      const svc = await getService();
      return getUserContent(svc, { platform, userId, limit: parseInt(opts.limit) });
    });
  });

program
  .command('status')
  .description('Show available platforms and capabilities')
  .action(async () => {
    await run(async () => {
      const svc = await getService();
      return getPlatformStatus(svc);
    });
  });

program
  .command('health')
  .description('Check health of all platforms')
  .action(async () => {
    await run(async () => {
      const svc = await getService();
      return healthCheck(svc);
    });
  });

program.parse();
