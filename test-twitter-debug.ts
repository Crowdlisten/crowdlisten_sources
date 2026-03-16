#!/usr/bin/env node

// Debug script: opens Twitter search in the persistent session and inspects the DOM
// Run: npx tsx test-twitter-debug.ts

import dotenv from 'dotenv';
dotenv.config();

import { chromium } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';

const TWITTER_BASE = 'https://x.com';
const SESSION_DIR = path.join(process.cwd(), '.twitter-session');

async function debug() {
  if (!fs.existsSync(SESSION_DIR)) {
    console.error('No .twitter-session/ found — run test-twitter.ts first to log in');
    process.exit(1);
  }

  const context = await chromium.launchPersistentContext(SESSION_DIR, {
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--ignore-certificate-errors',
    ],
  });

  const page = context.pages()[0] || await context.newPage();

  // Go to search
  console.log('Navigating to search...');
  await page.goto(`${TWITTER_BASE}/search?q=${encodeURIComponent('AI news')}&src=typed_query&f=top`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });

  // Wait longer for content to render
  console.log('Waiting 8s for page to fully render...');
  await page.waitForTimeout(8000);

  await page.screenshot({ path: 'debug-search.png', fullPage: false });
  console.log('Screenshot saved to debug-search.png');

  // Check current URL
  console.log('Current URL:', page.url());

  // Check if we got redirected to login
  if (page.url().includes('/login')) {
    console.log('PROBLEM: Redirected to login — session may have expired');
    await context.close();
    return;
  }

  // Count articles
  const articleCount = await page.$$eval('article', els => els.length);
  console.log(`\n<article> elements: ${articleCount}`);

  const tweetArticles = await page.$$eval('article[data-testid="tweet"]', els => els.length);
  console.log(`article[data-testid="tweet"] elements: ${tweetArticles}`);

  // List ALL data-testid values on the page
  const testIds = await page.$$eval('[data-testid]', els =>
    [...new Set(els.map(el => el.getAttribute('data-testid')))].sort()
  );
  console.log(`\nAll data-testid values (${testIds.length}):`, testIds);

  // Check for common tweet container patterns
  const cellInnerDiv = await page.$$eval('div[data-testid="cellInnerDiv"]', els => els.length);
  console.log(`\ndiv[data-testid="cellInnerDiv"] elements: ${cellInnerDiv}`);

  // Try to get the raw HTML of the first tweet article (if any)
  if (tweetArticles > 0) {
    const firstTweetHtml = await page.$eval('article[data-testid="tweet"]', el => el.innerHTML.substring(0, 2000));
    console.log('\n=== First tweet article innerHTML (first 2000 chars) ===');
    console.log(firstTweetHtml);

    // Try extracting data from the first tweet
    const extracted = await page.$eval('article[data-testid="tweet"]', (article) => {
      const tweetText = article.querySelector('div[data-testid="tweetText"]');
      const userName = article.querySelector('div[data-testid="User-Name"]');
      const time = article.querySelector('time');
      const links = Array.from(article.querySelectorAll('a[href*="/status/"]'));
      const buttons = Array.from(article.querySelectorAll('button[data-testid]'));

      return {
        hasTweetText: !!tweetText,
        tweetTextContent: tweetText?.textContent?.substring(0, 200) || null,
        hasUserName: !!userName,
        userNameContent: userName?.textContent?.substring(0, 100) || null,
        hasTime: !!time,
        timeValue: time?.getAttribute('datetime') || null,
        statusLinks: links.map(l => l.getAttribute('href')),
        buttonTestIds: buttons.map(b => b.getAttribute('data-testid')),
        buttonLabels: buttons.map(b => ({ testId: b.getAttribute('data-testid'), ariaLabel: b.getAttribute('aria-label') })),
      };
    });
    console.log('\n=== Extracted from first tweet ===');
    console.log(JSON.stringify(extracted, null, 2));
  } else {
    // No tweet articles — dump the page body structure
    console.log('\n=== No tweet articles found. Checking page structure... ===');
    const bodyText = await page.$eval('body', el => el.innerText.substring(0, 1000));
    console.log('Page body text (first 1000 chars):');
    console.log(bodyText);

    // Check for any error messages or login prompts
    const h1s = await page.$$eval('h1, h2, h3', els => els.map(el => el.textContent?.trim()));
    console.log('\nHeadings on page:', h1s);
  }

  // Scroll and check again
  console.log('\n=== Scrolling 3 times... ===');
  for (let i = 0; i < 3; i++) {
    await page.evaluate('scrollBy(0, innerHeight)');
    await page.waitForTimeout(2000);
  }
  const afterScroll = await page.$$eval('article[data-testid="tweet"]', els => els.length);
  console.log(`After scrolling: ${afterScroll} tweet articles`);
  await page.screenshot({ path: 'debug-search-scrolled.png', fullPage: false });

  await context.close();
  console.log('\nDone! Check debug-search.png and debug-search-scrolled.png');
}

debug().catch(console.error);
