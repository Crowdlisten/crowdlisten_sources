# Code Style & Conventions

## TypeScript Standards
- **Strict typing**: Full TypeScript with proper interfaces
- **Async/await**: Use modern async patterns, no callbacks
- **Error handling**: Comprehensive try/catch with proper error types
- **Imports**: ES6 module imports, organize by external/internal

## Naming Conventions
- **Files**: PascalCase for classes (TwitterAdapter.ts), camelCase for utilities
- **Classes**: PascalCase (UnifiedSocialMediaService)
- **Methods/functions**: camelCase (analyzeContent, getTrendingContent)
- **Interfaces**: PascalCase with descriptive names (SocialMediaPlatform, ContentAnalysis)
- **Constants**: UPPER_SNAKE_CASE for environment variables

## Architecture Patterns
- **Adapter Pattern**: Each platform has dedicated adapter implementing common interface
- **Service Layer**: UnifiedSocialMediaService coordinates all adapters
- **Error Boundaries**: BaseAdapter provides common error handling
- **Data Normalization**: Consistent data structures across platforms

## Documentation
- **JSDoc comments**: For public methods and complex logic
- **Interface documentation**: Clear parameter and return type descriptions
- **README files**: Comprehensive setup and usage guides
- **Type definitions**: Explicit types for all function parameters and returns

## Code Organization
- **Separation of concerns**: Interfaces, base classes, platform implementations, services
- **Single responsibility**: Each class/module has one clear purpose
- **Dependency injection**: Configuration passed to constructors
- **Clean abstractions**: Platform complexities hidden behind unified interface