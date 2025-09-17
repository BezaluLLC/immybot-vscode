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
	console.log(`Congratulations, your extension "immybot" is now active in the ${context.extensionMode} extension host!`);

	// Create the output channel during activation
	extensionState.authOutputChannel = vscode.window.createOutputChannel("ImmyBot");
	context.subscriptions.push(extensionState.authOutputChannel);

	// Initialize script manager with instanceUrl
	const instanceUrl = await getInstanceUrl(context);
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
			// Ensure scriptManager is updated with current instanceUrl
			if (extensionState.instanceUrl && (!scriptManager || (scriptManager as any).instanceUrl !== extensionState.instanceUrl)) {
				scriptManager = new ScriptManager(immyFs, extensionState.instanceUrl);
			}
			return scriptManager;
		}
	);

	// Register file system provider immediately during activation
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('immyfs', immyFs, { isCaseSensitive: true }));

	// Try to sign in silently on startup
	await attemptSignIn(false, extensionState, updateState, async () => {
		// Update scriptManager with current instanceUrl before fetching
		const currentInstanceUrl = extensionState.instanceUrl || await getInstanceUrl(context);
		scriptManager = new ScriptManager(immyFs, currentInstanceUrl);
		updateState({ instanceUrl: currentInstanceUrl });
		
		await scriptManager.fetchScripts();
		localRepoProvider.refresh();
		globalRepoProvider.refresh();
	});
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