#!/usr/bin/env node

/**
 * CrowdListen CLI
 * Cross-channel feedback analysis for AI agents.
 * Extracts audience signal (pain points, feature requests, sentiment) from
 * social platforms into structured JSON. stdout = data, stderr = errors.
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
  deepAnalyze,
  extractInsights,
  researchSynthesis,
} from './handlers.js';

const program = new Command();

program
  .name('crowdlisten')
  .description('Cross-channel feedback analysis for AI agents')
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
    const depth = opts.depth;
    // Route deep/comprehensive to paid agent API
    if (depth === 'deep' || depth === 'comprehensive') {
      await run(async () => deepAnalyze({ platform, contentId, analysisDepth: depth }));
    } else {
      await run(async () => {
        const svc = await getService();
        return analyzeContent(svc, {
          platform,
          contentId,
          analysisDepth: depth,
          enableClustering: opts.clustering !== false,
        });
      });
    }
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

// --- Paid Commands (require CROWDLISTEN_API_KEY) ---

program
  .command('insights <platform> <contentId>')
  .description('Extract structured insights with categorization and confidence (paid)')
  .option('-c, --categories <list>', 'Comma-separated insight categories', '')
  .action(async (platform: string, contentId: string, opts: any) => {
    await run(async () => extractInsights({
      platform,
      contentId,
      categories: opts.categories ? opts.categories.split(',') : undefined,
    }));
  });

program
  .command('research <query>')
  .description('Multi-source research synthesis with AI analysis (paid)')
  .option('-p, --platforms <list>', 'Comma-separated platforms', 'reddit,twitter,youtube')
  .option('-d, --depth <level>', 'Research depth (quick|standard|deep)', 'standard')
  .action(async (query: string, opts: any) => {
    await run(async () => researchSynthesis({
      query,
      platforms: opts.platforms.split(','),
      depth: opts.depth,
    }));
  });

// When called by an MCP client (piped stdin, no CLI args), start MCP server
if (process.argv.length <= 2 && !process.stdin.isTTY) {
  import('./index.js').then(({ main }) => main());
} else {
  program.parse();
}
