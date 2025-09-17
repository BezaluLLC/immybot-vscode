/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { ImmyBotFileSystemProvider } from './immyBotFileSystemProvider';
import { ExtensionState } from './types';
import { ImmyBotScriptTreeDataProvider } from './treeProvider';
import { ScriptManager } from './scriptManager';
import { registerCommands } from './commands';
import { attemptSignIn } from './authentication';
import { loadDevelopmentConfig, isDevelopmentMode, updateDevelopmentConfig } from './developmentConfig';

const immyFs = new ImmyBotFileSystemProvider();

// Extension state management
let extensionState: ExtensionState = {
	initialized: false,
	firstName: 'User'
};

function updateState(updates: Partial<ExtensionState>) {
	extensionState = { ...extensionState, ...updates };
}

let localRepoProvider: ImmyBotScriptTreeDataProvider;
let globalRepoProvider: ImmyBotScriptTreeDataProvider;
let localRepoView: vscode.TreeView<any>;
let globalRepoView: vscode.TreeView<any>;
let scriptManager: ScriptManager;

// This method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	// Store the context so it can be accessed from other functions
	extensionState.extensionContext = context;

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	// Create the output channel during activation
	extensionState.authOutputChannel = vscode.window.createOutputChannel("ImmyBot");
	context.subscriptions.push(extensionState.authOutputChannel);
	
	// Log activation to output channel immediately
	extensionState.authOutputChannel.appendLine('=== ImmyBot Extension Activated ===');
	extensionState.authOutputChannel.appendLine(`Extension mode: ${context.extensionMode}`);
	extensionState.authOutputChannel.appendLine(`Activation time: ${new Date().toISOString()}`);

	// Load development configuration if in development mode
	let devConfig = {};
	if (isDevelopmentMode()) {
		devConfig = await loadDevelopmentConfig();
		extensionState.authOutputChannel?.appendLine('Development mode detected');
		extensionState.authOutputChannel?.appendLine(`Development config: ${JSON.stringify(devConfig, null, 2)}`);
	}

	// Initialize script manager with instanceUrl (prefer dev config, then settings)
	const instanceUrl = (devConfig as any)['immybot.instanceUrl'] || await getInstanceUrl(context);
	scriptManager = new ScriptManager(immyFs, instanceUrl);
	updateState({ instanceUrl });

	// Set up authentication callback for file system
	immyFs.setAuthenticationCallback(() => extensionState.initialized);

	// Set up tree view providers for repositories
	localRepoProvider = new ImmyBotScriptTreeDataProvider('local', immyFs, () => extensionState);
	globalRepoProvider = new ImmyBotScriptTreeDataProvider('global', immyFs, () => extensionState);

	localRepoView = vscode.window.createTreeView('immybot-localrepo', {
		treeDataProvider: localRepoProvider,
		showCollapseAll: true
	});

	globalRepoView = vscode.window.createTreeView('immybot-globalrepo', {
		treeDataProvider: globalRepoProvider,
		showCollapseAll: true
	});

	context.subscriptions.push(localRepoView);
	context.subscriptions.push(globalRepoView);

	// Register all commands
	registerCommands(
		context,
		extensionState,
		updateState,
		immyFs,
		localRepoProvider,
		globalRepoProvider,
		() => {
			// Ensure scriptManager is updated with current instanceUrl and access token
			if (extensionState.instanceUrl && (!scriptManager || (scriptManager as any).instanceUrl !== extensionState.instanceUrl)) {
				scriptManager = new ScriptManager(immyFs, extensionState.instanceUrl, extensionState.immyBotAccessToken);
			} else if (scriptManager && extensionState.immyBotAccessToken) {
				// Update access token if scriptManager exists but token changed
				scriptManager.setAccessToken(extensionState.immyBotAccessToken);
			}
			return scriptManager;
		}
	);

	// Register file system provider immediately during activation
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('immyfs', immyFs, { isCaseSensitive: true }));

	// Check if auto sign-in is enabled (prefer dev config, then settings)
	const config = vscode.workspace.getConfiguration('immybot');
	const autoSignIn = (devConfig as any)['immybot.autoSignIn'] ?? config.get<boolean>('autoSignIn', false);
	const existingAccessToken = (devConfig as any)['immybot.accessToken'];
	
	extensionState.authOutputChannel?.appendLine('ImmyBot Extension: Starting authentication flow...');
	extensionState.authOutputChannel?.appendLine(`Auto sign-in enabled: ${autoSignIn}`);
	extensionState.authOutputChannel?.appendLine(`Instance URL: ${extensionState.instanceUrl}`);
	extensionState.authOutputChannel?.appendLine(`Has existing access token: ${!!existingAccessToken}`);
	
	// If we have an existing access token in dev config, use it directly
	if (isDevelopmentMode() && existingAccessToken && extensionState.instanceUrl) {
		extensionState.authOutputChannel?.appendLine('Using existing access token from development config');
		
		updateState({
			immyBotAccessToken: existingAccessToken,
			initialized: true
		});
		
		// Set context to update sidebar visibility
		await vscode.commands.executeCommand('setContext', 'immybot:authenticated', true);
		
		// Fetch scripts with existing token
		scriptManager = new ScriptManager(immyFs, extensionState.instanceUrl, existingAccessToken);
		try {
			await scriptManager.fetchScripts();
			localRepoProvider.refresh();
			globalRepoProvider.refresh();
			extensionState.authOutputChannel?.appendLine('Successfully loaded scripts with existing token');
		} catch (error) {
			extensionState.authOutputChannel?.appendLine(`Failed to load scripts with existing token: ${error}`);
		}
	} else if (autoSignIn) {
		// Auto sign-in for testing - force authentication
		extensionState.authOutputChannel?.appendLine('Auto sign-in enabled - attempting authentication...');
		
		await attemptSignIn(true, extensionState, updateState, async () => {
			// Update scriptManager with current instanceUrl and access token before fetching
			const currentInstanceUrl = extensionState.instanceUrl || await getInstanceUrl(context);
			scriptManager = new ScriptManager(immyFs, currentInstanceUrl, extensionState.immyBotAccessToken);
			updateState({ instanceUrl: currentInstanceUrl });
			
			extensionState.authOutputChannel?.appendLine('Fetching scripts from ImmyBot API...');
			await scriptManager.fetchScripts();
			localRepoProvider.refresh();
			globalRepoProvider.refresh();
		});
	} else {
		// Try to sign in silently on startup
		extensionState.authOutputChannel?.appendLine('Attempting silent sign-in...');
		
		await attemptSignIn(false, extensionState, updateState, async () => {
			// Update scriptManager with current instanceUrl and access token before fetching
			const currentInstanceUrl = extensionState.instanceUrl || await getInstanceUrl(context);
			scriptManager = new ScriptManager(immyFs, currentInstanceUrl, extensionState.immyBotAccessToken);
			updateState({ instanceUrl: currentInstanceUrl });
			
			extensionState.authOutputChannel?.appendLine('Fetching scripts from ImmyBot API...');
			await scriptManager.fetchScripts();
			localRepoProvider.refresh();
			globalRepoProvider.refresh();
		});
	}
}

// Helper function to get or prompt for instanceUrl
async function getInstanceUrl(context: vscode.ExtensionContext): Promise<string> {
	const config = vscode.workspace.getConfiguration('immybot');
	let instanceUrl = config.get<string>('instanceUrl', '');
	
	if (!instanceUrl) {
		// Prompt user for instanceUrl
		instanceUrl = await vscode.window.showInputBox({
			prompt: 'Enter your ImmyBot instance URL',
			placeHolder: 'https://your-tenant.immy.bot',
			validateInput: (value: string) => {
				if (!value) {
					return 'Instance URL is required';
				}
				if (!value.match(/^https?:\/\/.+/)) {
					return 'Please enter a valid HTTP or HTTPS URL';
				}
				return null;
			}
		}) || '';
		
		if (instanceUrl) {
			// Save to user settings
			await config.update('instanceUrl', instanceUrl, vscode.ConfigurationTarget.Global);
		}
	}
	
	return instanceUrl;
}

// This method is called when your extension is deactivated
export function deactivate() {
	// Noop
}