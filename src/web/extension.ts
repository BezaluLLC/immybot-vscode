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

// This method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "immybot" is now active in the web extension host!');

	if (!initialized) {
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
		await signIn();
		await fetchScripts();
		initialized = true;
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
		console.error(startResponse);
		return;
	}
	console.log("Language server started!");
	const ws = new WebSocket(`ws://localhost:5000/api/v1/scripts/language-service/${terminalId}/language`);
	ws.onopen = async () => {
		vscode.window.showInformationMessage("Language client websocket opened");
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
	};
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
async function signIn() {
	session = await vscode.authentication.getSession('microsoft', SCOPES, { createIfNone: true });
	if (session !== undefined && session.accessToken !== undefined) {
		vscode.window.showInformationMessage('Signed in as ' + session.account.label);
		return true;
	}
	console.error("Sign in failed");
	return false;
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
	response.forEach((script: any) => {
		const extension = script.scriptCategory === 11 ? '.psm1' : '.ps1';
		const fileName = `memfs:/${ScriptCategory[script.scriptCategory]}/${script.name}${extension}`;
		try {
			memFs.writeFile(vscode.Uri.parse(fileName), Buffer.from(script.action), { create: true, overwrite: true });
		} catch (e) {
			console.error(e);
		}
	});
}




// This method is called when your extension is deactivated
export function deactivate() {
	// Noop
}
