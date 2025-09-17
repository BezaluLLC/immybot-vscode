# ImmyBot VSCode Extension - Agents.md

## Project Overview

This is a VSCode web extension that allows users to edit ImmyBot scripts directly from VS Code. The extension provides:

- Authentication with ImmyBot instances via Microsoft OAuth
- Tree view for browsing local and global script repositories
- In-memory file system for editing scripts using [`immyfs://`](src/web/immyBotFileSystemProvider.ts:1) scheme
- PowerShell language server integration
- Script management capabilities (create, edit, save, delete)

## Architecture

### Core Components

- **[`src/web/extension.ts`](src/web/extension.ts:1)** - Main extension entry point and orchestrator
- **[`src/web/authentication.ts`](src/web/authentication.ts:1)** - Microsoft OAuth authentication and JWT handling
- **[`src/web/immyBotFileSystemProvider.ts`](src/web/immyBotFileSystemProvider.ts:1)** - Virtual file system provider
- **[`src/web/treeProvider.ts`](src/web/treeProvider.ts:1)** - Tree view providers for script repositories
- **[`src/web/scriptManager.ts`](src/web/scriptManager.ts:1)** - Script fetching and management
- **[`src/web/commands.ts`](src/web/commands.ts:1)** - Command handlers and registrations
- **[`src/web/immyBotClient.ts`](src/web/immyBotClient.ts:1)** - HTTP client for ImmyBot API
- **[`src/web/languageServer.ts`](src/web/languageServer.ts:1)** - PowerShell language server integration

## Development Setup

### Prerequisites
- Node.js >= 20.0.0
- npm
- VSCode
- PowerShell

### Installation
```bash
npm install
```

### Development Commands
- **Build**: [`npm run compile-web`](package.json:226) - Compiles TypeScript to JavaScript
- **Package**: [`npm run package-web`](package.json:227) - Production build
- **Lint**: [`npm run lint`](package.json:230) - Runs oxlint + eslint
- **Test**: [`npm run test`](package.json:222) - Runs web extension tests

## Testing Code Changes

**IMPORTANT**: Always use [`Test-ImmyBotExtension.ps1`](Test-ImmyBotExtension.ps1:1) to test code changes instead of manually running individual commands or attempting to gather logs yourself.

### Usage
```powershell
# Test with default 15-second timeout
./Test-ImmyBotExtension.ps1

# Test with custom timeout
./Test-ImmyBotExtension.ps1 -TimeoutSeconds 30
```

### Why Use This Script
The script automatically:
1. Builds the extension and exits on failure
2. Creates an isolated VSCode environment with fresh logs
3. Launches VSCode with the extension loaded
4. Waits for extension activation and operation
5. Analyzes logs for extension activity and errors
6. Cleans up processes and temporary files

This provides a complete test cycle in one command with proper log analysis, eliminating the need for manual build commands, log hunting, or process management.

## API Integration

The extension integrates with the ImmyBot REST API:
- **Scripts**: [`/api/v1/scripts/local`](ImmyBot-Script-API-README.md:33), [`/api/v1/scripts/global`](ImmyBot-Script-API-README.md:39)
- **Authentication**: Microsoft OAuth with JWT tokens
- **Categories**: Software Detection (0), Software Version Action (2), Function (7), Module (11), Integration (13)
- **Contexts**: Metascript (2), CloudScript (4), System (0), User (1)

## File Structure
```
immybot-vscode/
├── src/web/                    # Extension source code
│   ├── extension.ts           # Main entry point
│   ├── authentication.ts      # OAuth authentication
│   ├── immyBotFileSystemProvider.ts  # Virtual file system
│   ├── treeProvider.ts        # Tree view providers
│   ├── scriptManager.ts       # Script management
│   ├── commands.ts            # Command handlers
│   ├── immyBotClient.ts       # API client
│   ├── languageServer.ts      # Language server setup
│   └── types.ts               # TypeScript definitions
├── Test-ImmyBotExtension.ps1  # Testing script
├── package.json               # Extension manifest
└── README.md                  # Basic documentation
```

## Contributing Guidelines

1. **Code Style**: Uses oxlint + eslint for linting
2. **Testing**: Always use [`Test-ImmyBotExtension.ps1`](Test-ImmyBotExtension.ps1:1) for testing changes
3. **Architecture**: Follow single responsibility principle
4. **State Management**: Centralized state through [`ExtensionState`](src/web/types.ts:1) interface

## Security Considerations

- OAuth tokens stored securely in VSCode's secret storage
- API keys never logged or exposed in plain text
- Instance URLs validated against HTTPS pattern
- User data isolated per VSCode instance

---

*This extension enables seamless ImmyBot script development directly within VSCode, providing a familiar development environment for PowerShell automation scripts.*