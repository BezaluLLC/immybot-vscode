/**
 * Language server client setup for ImmyBot metascript support
 */
import * as vscode from 'vscode';
import { WebSocketMessageReader, WebSocketMessageWriter, toSocket } from "vscode-ws-jsonrpc";
import {
	CloseAction,
	ErrorAction,
	MessageTransports,
} from 'vscode-languageclient';
import { MonacoLanguageClient } from "monaco-languageclient";

export async function startLanguageServerAndClient(context: vscode.ExtensionContext) {
	try {
		// Document selector definition retained internally in createLanguageClient
		// Options to control the language client
		// Client options object not currently used directly; configuration passed later in createLanguageClient
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
				vscode.window.showInformationMessage("Starting language client");

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
			documentSelector: [{ scheme: 'immyfs', language: 'metascript' }]
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