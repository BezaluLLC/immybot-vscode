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

// Class for TreeView items
class ImmyBotTreeItem extends vscode.TreeItem {
	constructor(
		public readonly label: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly children?: ImmyBotTreeItem[],
		iconName?: string,
		description?: string
	) {
		super(label, collapsibleState);
		
		// Set description if provided
		if (description) {
			this.description = description;
		}
		
		// Set icon path if provided
		if (iconName) {
			this.iconPath = new vscode.ThemeIcon(iconName);
		} else {
			// Default icons based on item type
			switch (label) {
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
			// Clear session
			session = undefined as any;
			
			// Update context to hide authenticated views
			await vscode.commands.executeCommand('setContext', 'immybot:authenticated', false);
			
			vscode.window.showInformationMessage('Signed out successfully');
			authOutputChannel.appendLine('User signed out');
		})
	);
	
	// Track when editors are opened to enable/disable buttons
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(() => {
			updateEditorContext();
		})
	);
	
	// Set initial editor context
	updateEditorContext();

	if (!initialized) {
		try {
			// The command has been defined in the package.json file
			// Now provide the implementation of the command with registerCommand
			// The commandId parameter must match the command field in package.json
			context.subscriptions.push(vscode.commands.registerCommand('immybot.helloWorld', () => {
				// The code you place here will be executed every time your command is executed

				// Display a message box to the user
				vscode.window.showInformationMessage('Hello World from immybot in a web extension host!');
			}));
			context.subscriptions.push(
				vscode.commands.registerCommand('immybot.signIn', async () => {
					await signIn();
				}));

			context.subscriptions.push(
				vscode.workspace.onDidOpenTextDocument(async (document) => {
					if (document.uri.scheme === 'memfs') {
						if (document.languageId === 'metascript') {
							await startLanguageServerAndClient(context);
						}
					}
				}));
			registerFileSystemProvider(context);
			const signedIn = await signIn();
			if (signedIn) {
				await fetchScripts();
			}
			initialized = true;
		} catch (error) {
			console.error("Error during extension activation:", error);
			vscode.window.showErrorMessage(`ImmyBot extension activation failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
function registerFileSystemProvider(context: vscode.ExtensionContext) {
	if (initialized) {
		return;
	}
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('memfs', memFs, { isCaseSensitive: true }));

	context.subscriptions.push(vscode.commands.registerCommand('memfs.reset', async (_) => {
		await signIn();
		// for (const [name] of memFs.readDirectory(vscode.Uri.parse('memfs:/'))) {
		// 	memFs.delete(vscode.Uri.parse(`memfs:/${name}`));
		// }
		// initialized = false;
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

async function signIn() {
	try {
		session = await vscode.authentication.getSession('microsoft', SCOPES, { createIfNone: true });
		if (session !== undefined && session.accessToken !== undefined) {
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
			
			return true;
		}
		vscode.window.showWarningMessage('Sign in failed: No valid session obtained');
		console.error("Sign in failed: No valid session");
		return false;
	} catch (error) {
		vscode.window.showErrorMessage(`Authentication error: ${error instanceof Error ? error.message : String(error)}`);
		console.error("Authentication error:", error);
		return false;
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
