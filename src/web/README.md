# Code Organization Refactoring

This directory contains the refactored ImmyBot VS Code extension code, broken down into focused modules for better maintainability.

## File Structure

### Core Files

- **`extension.ts`** (79 lines) - Main extension entry point that orchestrates all components
- **`types.ts`** (86 lines) - Common types, enums, and interfaces used across the extension

### Feature Modules

- **`authentication.ts`** (155 lines) - Handles Microsoft authentication, JWT parsing, and session management
- **`treeProvider.ts`** (181 lines) - Manages the tree view providers for local and global script repositories
- **`scriptManager.ts`** (181 lines) - Handles script fetching, directory creation, and metadata processing
- **`languageServer.ts`** (124 lines) - Sets up language server client for PowerShell/metascript support
- **`commands.ts`** (603 lines) - Contains all command registrations and handlers

### Supporting Files

- **`fileSystemProvider.ts`** - In-memory file system provider (existing)
- **`immyBotClient.ts`** - HTTP client for ImmyBot API (existing)

## Architecture

### State Management
The extension uses a centralized state object (`ExtensionState`) that is managed through:
- Global state variable `extensionState`
- Update function `updateState()` for controlled mutations
- State access through getter functions passed to components

### Component Relationships
```
extension.ts (main orchestrator)
├── types.ts (shared definitions)
├── authentication.ts (auth flows)
├── scriptManager.ts (script operations)
├── treeProvider.ts (UI tree views)
├── commands.ts (command handlers)
├── languageServer.ts (language support)
├── fileSystemProvider.ts (virtual file system)
└── immyBotClient.ts (API client)
```

## Key Improvements

1. **Single Responsibility**: Each file has one clear purpose
2. **Reduced Complexity**: Main file reduced from 1349 to 79 lines (95% reduction)
3. **Better Testability**: Components can be unit tested in isolation
4. **Clearer Dependencies**: Explicit imports show component relationships
5. **Maintainability**: Easier to locate and modify specific functionality

## Migration Notes

- All original functionality is preserved
- No breaking changes to the extension API
- State management is now centralized and controlled
- Command handlers are organized by functional area
- Authentication logic is completely isolated

This refactoring maintains backward compatibility while dramatically improving code organization and maintainability.