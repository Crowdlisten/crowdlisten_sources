# Development Commands

## Build & Run
```bash
npm install          # Install dependencies
npm run build        # Build TypeScript to dist/
npm start           # Run built server
npm run dev         # Development mode with watch
```

## Testing & Quality
```bash
npm test            # Run Jest tests
npm run build       # TypeScript compilation check
```

## Environment Setup
```bash
cp .env.example .env    # Create environment file
# Edit .env with API credentials
```

## Health Check
```bash
# Test server after starting
curl -X POST http://localhost:3000 -d '{"name":"health_check","arguments":{}}'
```

## Essential Environment Variables
- TWITTER_API_KEY, TWITTER_API_KEY_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_TOKEN_SECRET
- INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD  
- TIKTOK_MS_TOKEN (optional)
- No Reddit credentials needed

## System Commands (macOS)
- `ls` - list directory contents
- `find` - search for files
- `grep` - search in files  
- `git` - version control
- `node` - run JavaScript/TypeScript
- `npm` - package manager