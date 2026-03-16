#!/usr/bin/env node

// Full test of the Playwright-based Twitter adapter
// Run: npx tsx test-twitter.ts
//
// First run: a browser opens — log in manually. Session is saved to .twitter-session/
// Future runs: reuses the saved session automatically.

import dotenv from 'dotenv';
dotenv.config();

import { TwitterAdapter } from './src/platforms/TwitterAdapter.js';

async function testTwitter() {
  const adapter = new TwitterAdapter({
    platform: 'twitter',
    credentials: {},
  });

  console.log('=== Initializing Twitter adapter ===\n');
  const ok = await adapter.initialize();
  console.log('Initialized:', ok);

  if (!ok) {
    console.error('Init failed — did you complete login in the browser window?');
    await adapter.cleanup();
    process.exit(1);
  }

  // 1. Test search
  console.log('\n=== 1. Testing searchContent("AI news", 3) ===');
  try {
    const posts = await adapter.searchContent('AI news', 3);
    console.log(`Found ${posts.length} posts`);
    for (const p of posts) {
      console.log(`  @${p.author.username}: ${(p.content || '').substring(0, 80)}...`);
      console.log(`    likes=${p.engagement.likes} replies=${p.engagement.comments} views=${p.engagement.views}`);
      console.log(`    id=${p.id} url=${p.url}`);
    }

    // 2. Test comments using the first post's ID
    if (posts.length > 0 && posts[0].id) {
      console.log(`\n=== 2. Testing getContentComments("${posts[0].id}", 5) ===`);
      try {
        const comments = await adapter.getContentComments(posts[0].id, 5);
        console.log(`Found ${comments.length} comments`);
        for (const c of comments) {
          console.log(`  @${c.author.username}: ${(c.text || '').substring(0, 80)}...`);
          console.log(`    likes=${c.likes}`);
        }
      } catch (err: any) {
        console.error('Comments failed:', err.message);
      }
    } else {
      console.log('\n=== 2. Skipping getContentComments (no post ID from search) ===');
    }
  } catch (err: any) {
    console.error('Search failed:', err.message);
  }

  // 3. Test user content
  console.log('\n=== 3. Testing getUserContent("elonmusk", 3) ===');
  try {
    const posts = await adapter.getUserContent('elonmusk', 3);
    console.log(`Found ${posts.length} posts`);
    for (const p of posts) {
      console.log(`  @${p.author.username}: ${(p.content || '').substring(0, 80)}...`);
      console.log(`    likes=${p.engagement.likes} replies=${p.engagement.comments} views=${p.engagement.views}`);
    }
  } catch (err: any) {
    console.error('User content failed:', err.message);
  }

  // 4. Test trending
  console.log('\n=== 4. Testing getTrendingContent(5) ===');
  try {
    const posts = await adapter.getTrendingContent(5);
    console.log(`Found ${posts.length} trending posts`);
    for (const p of posts) {
      console.log(`  @${p.author.username}: ${(p.content || '').substring(0, 80)}...`);
      console.log(`    likes=${p.engagement.likes} replies=${p.engagement.comments} views=${p.engagement.views}`);
    }
  } catch (err: any) {
    console.error('Trending failed:', err.message);
  }

  await adapter.cleanup();
  console.log('\n=== All tests complete! ===');
}

testTwitter().catch(console.error);
