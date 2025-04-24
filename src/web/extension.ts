/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { MemFS } from './fileSystemProvider';
import { ImmyBotClient } from './immyBotClient';
import { WebSocketMessageReader, WebSocketMessageWriter, toSocket } from "vscode-ws-jsonrpc";

// import { LanguageClientOptions } from 'vscode-languageclient';

import {
	CloseAction,
	ErrorAction,
	LanguageClientOptions,
	MessageTransports,
} from 'vscode-languageclient';
import { MonacoLanguageClient } from "monaco-languageclient";

const memFs = new MemFS();

const CLIENT_ID = 'f72a44d4-d2d4-450e-a2db-76b307cd045f';
const SCOPES = [
	`VSCODE_CLIENT_ID:${CLIENT_ID}`,
	`VSCODE_TENANT:common`,
	'profile',
	'openid',
	'offline_access',
	'Files.ReadWrite',
];
let initialized = false;
let session: vscode.AuthenticationSession;
let authOutputChannel: vscode.OutputChannel;

// Declare context at the module level
let extensionContext: vscode.ExtensionContext;

// Class for TreeView items
class ImmyBotTreeItem extends vscode.TreeItem {
	constructor(
		labelText: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly children?: ImmyBotTreeItem[],
		iconName?: string,
		description?: string
	) {
		// Use the original label without decoration
		super(labelText, collapsibleState);
		
		// Set description if provided
		if (description) {
			this.description = description;
		}
		
		// Set icon path if provided
		if (iconName) {
			this.iconPath = new vscode.ThemeIcon(iconName);
		} else {
			// Default icons based on item type
			switch (labelText) {
				case 'My Scripts':
				case 'Global Scripts':
					this.iconPath = new vscode.ThemeIcon('repo');
					break;
				case 'Modules':
					this.iconPath = new vscode.ThemeIcon('package');
					break;
				case 'Functions':
					this.iconPath = new vscode.ThemeIcon('symbol-method');
					break;
				case 'Software':
					this.iconPath = new vscode.ThemeIcon('desktop-download');
					break;
				case 'Task':
					this.iconPath = new vscode.ThemeIcon('tasklist');
					break;
				case 'Inventory':
					this.iconPath = new vscode.ThemeIcon('database');
					break;
				case 'Preflight':
					this.iconPath = new vscode.ThemeIcon('checklist');
					break;
				case 'Integration':
					this.iconPath = new vscode.ThemeIcon('plug');
					break;
				case 'Deployment':
					this.iconPath = new vscode.ThemeIcon('rocket');
					break;
				default:
					this.iconPath = new vscode.ThemeIcon('file');
			}
		}
	}
}

// TreeView provider for repositories
class ImmyBotRepoProvider implements vscode.TreeDataProvider<ImmyBotTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ImmyBotTreeItem | undefined | null | void> = new vscode.EventEmitter<ImmyBotTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<ImmyBotTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	constructor(private repoType: 'local' | 'global') { }

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: ImmyBotTreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(element?: ImmyBotTreeItem): Thenable<ImmyBotTreeItem[]> {
		if (element) {
			// Return children if any
			return Promise.resolve(element.children || []);
		} else {
			// Root elements based on repo type
			if (this.repoType === 'local') {
				return Promise.resolve([
					new ImmyBotTreeItem('My Scripts', vscode.TreeItemCollapsibleState.Expanded, [
						new ImmyBotTreeItem('Modules', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Functions', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Software', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Task', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Inventory', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Preflight', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Integration', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Deployment', vscode.TreeItemCollapsibleState.Collapsed)
					], undefined, `Signed in as ${firstName}`)
				]);
			} else {
				return Promise.resolve([
					new ImmyBotTreeItem('Global Scripts', vscode.TreeItemCollapsibleState.Expanded, [
						new ImmyBotTreeItem('Modules', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Functions', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Software', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Task', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Inventory', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Preflight', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Integration', vscode.TreeItemCollapsibleState.Collapsed),
						new ImmyBotTreeItem('Deployment', vscode.TreeItemCollapsibleState.Collapsed)
					], undefined, `Signed in as ${firstName}`)
				]);
			}
		}
	}
}

let firstName = 'User'; // Default value
let localRepoProvider: ImmyBotRepoProvider;
let globalRepoProvider: ImmyBotRepoProvider;
let localRepoView: vscode.TreeView<ImmyBotTreeItem>;
let globalRepoView: vscode.TreeView<ImmyBotTreeItem>;

// This method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	// Store the context so it can be accessed from other functions
	extensionContext = context;

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "immybot" is now active in the web extension host!');
	
	// Create the output channel during activation
	authOutputChannel = vscode.window.createOutputChannel("Microsoft Authentication");
	context.subscriptions.push(authOutputChannel);

	// Set up tree view providers for repositories
	localRepoProvider = new ImmyBotRepoProvider('local');
	globalRepoProvider = new ImmyBotRepoProvider('global');
	
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

	// Register command to refresh views
	context.subscriptions.push(
		vscode.commands.registerCommand('immybot.refreshRepos', () => {
			localRepoProvider.refresh();
			globalRepoProvider.refresh();
		})
	);
	
	// Register toolbar commands
	context.subscriptions.push(
		vscode.commands.registerCommand('immybot.save', async () => {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				await editor.document.save();
				vscode.window.showInformationMessage('File saved successfully');
			}
		})
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('immybot.discard', () => {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				vscode.commands.executeCommand('workbench.action.files.revert');
				vscode.window.showInformationMessage('Changes discarded');
			}
		})
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('immybot.refresh', async () => {
			vscode.window.showInformationMessage('Refreshing scripts...');
			authOutputChannel.appendLine('Refreshing scripts from ImmyBot server');
			console.log('Refreshing scripts from ImmyBot server');
			
			try {
				await fetchScripts();
				vscode.window.showInformationMessage('Scripts refreshed successfully');
				// Refresh the tree views
				localRepoProvider.refresh();
				globalRepoProvider.refresh();
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Failed to refresh scripts: ${errorMessage}`);
				authOutputChannel.appendLine(`Error refreshing scripts: ${errorMessage}`);
			}
		})
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('immybot.signOut', async () => {
			// Remove the session - need to revoke it properly
			if (session) {
				try {
					// Log the session we're revoking
					authOutputChannel.appendLine(`Signing out user: ${session.account.label}`);
					
					// Store the session id before we clear it
					const sessionId = session.id;
					const accountId = session.account.id;
					
					// Clear our session variable first to prevent race conditions
					session = undefined as any;
					
					// Clear the in-memory filesystem
					for (const [name] of memFs.readDirectory(vscode.Uri.parse('memfs:/'))) {
						try {
							memFs.delete(vscode.Uri.parse(`memfs:/${name}`));
						} catch (e) {
							console.error(`Error cleaning up directory ${name}:`, e);
						}
					}
					
					// Reset initialization flag
					initialized = false;
					
					// Reset the authentication context to show the sign-in view
					await vscode.commands.executeCommand('setContext', 'immybot:authenticated', false);
					
					// We can't use signOut directly since it's not available in the API
					// Instead, try several approaches to ensure the session is truly cleared
					try {
						// 1. Clear session preference
						await vscode.authentication.getSession('microsoft', SCOPES, { 
							clearSessionPreference: true 
						});
						
						// 2. For VS Code versions that support it, try to get all sessions and remove them
						// This may not work in all VS Code versions, so we catch any errors
						try {
							// @ts-ignore - getSessions might exist in newer VS Code versions
							const allSessions = await vscode.authentication.getSessions?.('microsoft', SCOPES);
							if (allSessions && allSessions.length > 0) {
								// Log how many sessions we're clearing
								authOutputChannel.appendLine(`Found ${allSessions.length} active Microsoft sessions to clear`);
								
								// Try to iterate through and remove all sessions
								for (const sess of allSessions) {
									try {
										// Try to use internal APIs if available for better cleanup
										// @ts-ignore - this might exist in newer VS Code versions
										if (vscode.authentication.removeSession && typeof vscode.authentication.removeSession === 'function') {
											// @ts-ignore
											await vscode.authentication.removeSession('microsoft', sess.id);
											authOutputChannel.appendLine(`Removed session: ${sess.id}`);
										}
									} catch (e) {
										// Ignore errors when removing sessions
										console.log(`Error removing session ${sess.id}:`, e);
									}
								}
							}
						} catch (e) {
							// Ignore errors with the getSessions API which may not be available
							console.log('API for getSessions not available:', e);
						}
					} catch (error) {
						// Ignore errors when clearing session preference
						console.log('Error clearing sessions:', error);
					}
					
					// 3. Set a flag to force new session on next sign-in
					// Use globalState instead of workspaceState for better persistence
					await extensionContext.globalState.update('immybot.forceNewSession', true);
					
					// Log the successful sign-out
					vscode.window.showInformationMessage('Signed out successfully');
					authOutputChannel.appendLine('User signed out successfully');
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					vscode.window.showErrorMessage(`Sign out failed: ${errorMessage}`);
					authOutputChannel.appendLine(`Sign out failed: ${errorMessage}`);
				}
			} else {
				// No active session
				await vscode.commands.executeCommand('setContext', 'immybot:authenticated', false);
				authOutputChannel.appendLine('Sign out: No active session found');
				vscode.window.showInformationMessage('Signed out');
			}
		})
	);
	
	// Register the sign-in command - this is what gets called when the user clicks "Sign In"
	context.subscriptions.push(
		vscode.commands.registerCommand('immybot.signIn', async () => {
			// Only proceed with authentication when explicitly requested by user
			await attemptSignIn(true);
		})
	);
	
	// Track when editors are opened to enable/disable buttons
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => {
			updateEditorContext();
		})
	);
	
	// Listen for document opens to start the language server when needed
	context.subscriptions.push(
		vscode.workspace.onDidOpenTextDocument(async (document) => {
			if (document.uri.scheme === 'memfs') {
				if (document.languageId === 'metascript') {
					await startLanguageServerAndClient(context);
				}
			}
		})
	);
	
	// Register file system provider
	registerFileSystemProvider(context);
	
	// Set initial editor context
	updateEditorContext();

	// Check for existing session on startup but don't prompt for authentication
	if (!initialized) {
		try {
			// First check if we have the force new session flag set (from a previous sign-out)
			const forceNewSession = extensionContext.globalState.get('immybot.forceNewSession', false);
			
			if (forceNewSession) {
				// If the flag is set, we should stay signed out until the user explicitly signs in
				authOutputChannel.appendLine('Previous sign-out detected, remaining signed out');
				console.log('Previous sign-out detected, remaining signed out');
				// Set the UI to show the sign-in view
				await vscode.commands.executeCommand('setContext', 'immybot:authenticated', false);
			} else {
				// Only try to get an existing session if we don't have the flag set
				// Check if we already have a valid session without prompting for auth
				await attemptSignIn(false);
			}
		} catch (error) {
			console.error("Error during extension activation:", error);
			vscode.window.showErrorMessage(`ImmyBot extension activation failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}

// Helper function to handle sign-in attempts
async function attemptSignIn(promptForAuth: boolean): Promise<boolean> {
	try {
		// Check if we need to force a new session (set during sign-out)
		// Use globalState instead of workspaceState for better persistence
		const forceNewSession = extensionContext.globalState.get('immybot.forceNewSession', false);
		
		// If we're explicitly signing in and a new session is forced, use forceNewSession
		if (promptForAuth && forceNewSession) {
			// Clear the flag so we don't force new sessions forever
			await extensionContext.globalState.update('immybot.forceNewSession', false);
			
			// Force a completely new authentication
			session = await vscode.authentication.getSession('microsoft', SCOPES, { 
				forceNewSession: true
			});
			
			if (session) {
				await processSuccessfulSignIn();
				return true;
			}
			return false;
		}
		
		// Check for existing session first
		let existingSession: vscode.AuthenticationSession | undefined;
		
		try {
			// Try to get an existing session without creating a new one
			// Use createIfNone=false to ensure we don't auto-create a session
			existingSession = await vscode.authentication.getSession('microsoft', SCOPES, { 
				createIfNone: false,
				silent: !promptForAuth // Only show UI if explicitly requested
			});
		} catch (e) {
			// Ignore errors when silently checking for a session
			if (promptForAuth) {
				throw e; // Re-throw if we were explicitly trying to authenticate
			}
		}
		
		if (existingSession) {
			// We have an existing valid session
			session = existingSession;
			await processSuccessfulSignIn();
			return true;
		} else if (promptForAuth) {
			// No existing session but user clicked sign-in button, so prompt for auth
			session = await vscode.authentication.getSession('microsoft', SCOPES, { 
				createIfNone: true
			});
			
			if (session) {
				await processSuccessfulSignIn();
				return true;
			}
		} else {
			// No session and not prompting for auth - just show the sign-in view
			await vscode.commands.executeCommand('setContext', 'immybot:authenticated', false);
		}
		
		return false;
	} catch (error) {
		vscode.window.showErrorMessage(`Authentication error: ${error instanceof Error ? error.message : String(error)}`);
		console.error("Authentication error:", error);
		return false;
	}
}

// Process a successful sign-in - extract user info and set up views
async function processSuccessfulSignIn() {
	if (!session || !session.accessToken) {
		return false;
	}
	
	vscode.window.showInformationMessage('Signed in as ' + session.account.label);
	
	// Use the output channel created during activation
	authOutputChannel.appendLine(`Successfully signed in to Microsoft Authentication`);
	authOutputChannel.appendLine(`Account ID: ${session.account.id}`);
	authOutputChannel.appendLine(`Account Label: ${session.account.label}`);
	authOutputChannel.appendLine(`Session ID: ${session.id}`);
	authOutputChannel.appendLine(`Session Scopes: ${session.scopes.join(', ')}`);
	
	// Parse and log id token if available
	if ('idToken' in session) {
		const idToken = (session as any).idToken;
		if (idToken) {
			const tokenData = parseJwt(idToken);
			authOutputChannel.appendLine(`\nID Token Contents:`);
			
			// Log useful claims
			const claimsToDisplay = [
				'name', 'preferred_username', 'email', 'oid', 'tid', 
				'given_name', 'family_name', 'upn', 'unique_name', 'sub'
			];
			
			for (const claim of claimsToDisplay) {
				if (claim in tokenData) {
					authOutputChannel.appendLine(`  - ${claim}: ${tokenData[claim]}`);
				}
			}
			
			// Get first name from name claim
			if (tokenData.name) {
				firstName = tokenData.name.split(' ')[0]; // Get first part of the name
				
				// Refresh tree views to show the signed-in user
				localRepoProvider.refresh();
				globalRepoProvider.refresh();
			}
		}
	}
	
	authOutputChannel.show();
	
	// Set context to update sidebar visibility
	await vscode.commands.executeCommand('setContext', 'immybot:authenticated', true);
	
	// Update editor context
	updateEditorContext();
	
	// If not initialized, load scripts
	if (!initialized) {
		await fetchScripts();
		initialized = true;
	}
	
	return true;
}

function registerFileSystemProvider(context: vscode.ExtensionContext) {
	if (initialized) {
		return;
	}
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('memfs', memFs, { isCaseSensitive: true }));

	context.subscriptions.push(vscode.commands.registerCommand('memfs.reset', async (_) => {
		await attemptSignIn(true);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('memfs.addFile', _ => {
		if (initialized) {
			memFs.writeFile(vscode.Uri.parse(`memfs:/file.txt`), Buffer.from('foo'), { create: true, overwrite: true });
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('memfs.deleteFile', _ => {
		if (initialized) {
			memFs.delete(vscode.Uri.parse('memfs:/file.txt'));
		}
	}));

	vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('memfs:/'), name: 'ImmyBot' });
}

async function startLanguageServerAndClient(context: vscode.ExtensionContext) {
	try {
		const documentSelector = [{ scheme: 'memfs', language: 'powershell' }];
		// Options to control the language client
		const clientOptions: LanguageClientOptions = {
			documentSelector,
			synchronize: {},
			initializationOptions: {
				enableProfileLoading: false,
				analyzeOpenDocumentsOnly: false,
				scriptAnalysis: {
					enable: true,
				},
			},
			progressOnInitialization: true,
			connectionOptions: {}
		};
		console.log("Starting language server");
		const terminalId = '00000000-0000-0000-0000-000000000000';
		const startResponse = await fetch(`http://localhost:5000/api/v1/scripts/language-service/start`, {
			body: JSON.stringify({
				terminalId: terminalId,
				scriptType: 1
			}),
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			}
		});
		if (!startResponse.ok) {
			console.error("Failed to start language server:", startResponse.status, await startResponse.text());
			return;
		}
		console.log("Language server started!");
		
		// Create a disposable for the websocket that we can add to context.subscriptions
		const disposable = new vscode.Disposable(() => {
			// This will be called when the extension is deactivated
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.close();
			}
		});
		
		const ws = new WebSocket(`ws://localhost:5000/api/v1/scripts/language-service/${terminalId}/language`);
		
		// Add the websocket disposable to the context
		context.subscriptions.push(disposable);
		
		ws.onopen = async () => {
			vscode.window.showInformationMessage("Language client websocket opened");
			try {
				const socket = toSocket(ws as WebSocket);
				const reader = new WebSocketMessageReader(socket);
				const writer = new WebSocketMessageWriter(socket);

				let languageClient = createLanguageClient({
					reader,
					writer,
				});
				var startMessage = vscode.window.showInformationMessage("Starting language client");

				try {
					await languageClient.start();
					vscode.window.showInformationMessage("Language client started!");
					context.subscriptions.push(languageClient);
				}
				catch (error) {
					vscode.window.showInformationMessage("Language client failed to start");
					console.error(error);
				}
			} catch (error) {
				console.error("Error in websocket onopen handler:", error);
			}
		};
		
		ws.onerror = (error) => {
			console.error("WebSocket error:", error);
		};
		
		ws.onclose = (event) => {
			console.log("WebSocket closed:", event.code, event.reason);
		};
	} catch (error) {
		console.error("Error in startLanguageServerAndClient:", error);
	}
}

function createLanguageClient(transports: MessageTransports): MonacoLanguageClient {
	return new MonacoLanguageClient({
		name: "ImmyBot Language Client",
		clientOptions: {
			// use a language id as a document selector
			documentSelector: 				[	{ scheme: 'memfs', language: 'metascript' }]
			,
			initializationOptions: {
				enableProfileLoading: false,
				analyzeOpenDocumentsOnly: false,
				scriptAnalysis: {
					enable: true,
				},
			},

			progressOnInitialization: true,

			// disable the default error handler
			errorHandler: {
				error: () => ({ action: ErrorAction.Continue }),
				closed: () => ({ action: CloseAction.DoNotRestart }),
			},
		},
		// create a language client connection from the JSON RPC connection on demand
		connectionProvider: {
			get: () => {
				return Promise.resolve(transports);
			},
		},
	});
}

// Add helper function to parse JWT
function parseJwt(token: string) {
	try {
		// Base64 decoding
		const base64Url = token.split('.')[1];
		const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
		const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
			return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
		}).join(''));

		return JSON.parse(jsonPayload);
	} catch (e) {
		return { error: 'Unable to parse token', message: e instanceof Error ? e.message : String(e) };
	}
}

async function fetchScripts() {
	const client = new ImmyBotClient();
	const response = await client.fetchJson<any>('/api/v1/scripts');
	enum ScriptCategory {
		SoftwareDetection,
		SoftwareAutoUpdate,
		SoftwareVersionAction,
		MaintenanceTaskSetter,
		MetascriptDeploymentTarget,
		FilterScriptDeploymentTarget,
		DeviceInventory,
		Function,
		ImmySystem,
		DynamicVersions,
		DownloadInstaller,
		Module,
		Preflight,
		Integration,
		Unknown
	}

	for (const category of Object.values(ScriptCategory)) {
		if (typeof category === 'string') {
			memFs.createDirectory(vscode.Uri.parse(`memfs:/${category}`));
		}
	}

	vscode.window.showInformationMessage('Fetching scripts');
	if (response && Array.isArray(response)) {
		response.forEach((script: any) => {
			if (script && typeof script.scriptCategory !== 'undefined' && script.name && script.action) {
				const extension = script.scriptCategory === 11 ? '.psm1' : '.ps1';
				const fileName = `memfs:/${ScriptCategory[script.scriptCategory]}/${script.name}${extension}`;
				try {
					memFs.writeFile(vscode.Uri.parse(fileName), Buffer.from(script.action), { create: true, overwrite: true });
				} catch (e) {
					console.error(e);
				}
			}
		});
	} else {
		console.error('Failed to fetch scripts or invalid response format', response);
	}
}

// Helper function to update context for editor-dependent buttons
function updateEditorContext() {
	const isEditorOpen = vscode.window.activeTextEditor !== undefined;
	vscode.commands.executeCommand('setContext', 'editorIsOpen', isEditorOpen);
}

// This method is called when your extension is deactivated
export function deactivate() {
	// Noop
}
