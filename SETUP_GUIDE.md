# Quick Setup Guide

## 🚀 Quick Start (5 minutes)

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your credentials (see below)
```

3. **Build and run:**
```bash
npm run build
npm start
```

## 🔑 Essential API Keys

### 🐦 Twitter/X (Most Important)
**Why:** Most reliable API, best data quality
**Time to get:** 1-2 days (requires approval)
**Cost:** 🆓 Free tier is sufficient (1,500 tweets/month)

1. Go to [developer.twitter.com](https://developer.twitter.com)
2. Apply for developer account (FREE)
3. Create app → Generate keys
4. Add to .env:
```env
TWITTER_API_KEY=your_key
TWITTER_API_KEY_SECRET=your_secret  
TWITTER_ACCESS_TOKEN=your_token
TWITTER_ACCESS_TOKEN_SECRET=your_token_secret
```

**💡 Free Tier Details:**
- 1,500 API calls/month (plenty for testing)
- All core features included (search, timelines, trends)
- No credit card required
- Perfect for MCP server usage

### 📸 Instagram (Medium Priority)
**Why:** Good for visual content analysis
**Time to get:** Immediate (use existing account)

Just use your Instagram login:
```env
INSTAGRAM_USERNAME=your_username
INSTAGRAM_PASSWORD=your_password
```
⚠️ **Tip:** Create a dedicated account to avoid security flags

### 🎵 TikTok (Optional)
**Why:** Enhanced functionality, not required
**Time to get:** 5 minutes

1. Login to TikTok in browser
2. Press F12 → Application → Cookies
3. Copy `msToken` value:
```env
TIKTOK_MS_TOKEN=your_ms_token
```

### 🔴 Reddit (No Setup Required!)
**Why:** Works immediately, no credentials needed
**Time to get:** 0 minutes

Reddit functionality works out of the box!

## ⚡ Minimum Setup

**Just want to test it?** Only Reddit credentials are needed:

```env
# Leave Twitter/Instagram blank, Reddit works without auth
# TikTok works with limited functionality
```

The server will start with Reddit support immediately.

## 🛠️ Platform Priority Recommendations

### Essential (Start Here)
1. **Reddit** - No setup required, works immediately
2. **Twitter** - Best API quality, worth the developer account wait

### Optional (Add Later)  
3. **Instagram** - Good for visual content, easy setup but some risk
4. **TikTok** - Enhanced with MS token, works without it

## ⚠️ Common Issues & Quick Fixes

**"No platforms initialized"**
→ Check .env file exists and has correct format

**Twitter auth failed** 
→ Verify all 4 credentials, check app permissions

**Instagram login failed**
→ Try dedicated account, disable 2FA

**TikTok limited functionality**
→ Add MS token from browser cookies

## 🎯 Test Your Setup

Run health check:
```bash
# After starting server, test with:
curl -X POST http://localhost:3000 -d '{"name":"health_check","arguments":{}}'
```

Should return status of all configured platforms.

---

**Need help?** Check the full [README.md](README.md) for detailed instructions.