/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
const CLIENT_ID = 'f72a44d4-d2d4-450e-a2db-76b307cd045f';

const SCOPES = [
	`VSCODE_CLIENT_ID:${CLIENT_ID}`,
	`VSCODE_TENANT:common`,
	'profile',
	'openid',
	'offline_access',
	'Files.ReadWrite',
];
export class ResponseError extends Error {
	public static is(e: unknown, statusCode: number): e is ResponseError {
		return e instanceof ResponseError && e.response.status === statusCode;
	}

	constructor(public readonly response: Response, public readonly body: string) {
		super(`${response.status} ${response.statusText} from ${response.url}: ${body}`);
	}
}
export class ImmyBotClient {
	constructor(private readonly accessToken: string) { }


	public async fetchJson<T>(route: string, params?: RequestInit): Promise<T> {
		const response = await this.fetch(route, params);
		return await response.json();
	}
	private async fetch(route: string, params: RequestInit = {}) {
		params.headers = new Headers(params.headers);
		params.headers.set('authorization', `Bearer ${this.accessToken}`);

		const response = await fetch(route.startsWith('https:') ? route : `https://immense.immy.bot` + route, params);
		if (!response.ok) {
			let body: string;
			try {
				body = await response.text();
			} catch {
				body = '<unreadable>';
			}

			throw new ResponseError(response, body);
		}

		return response;
	}
}

export class ClientProvider {
	private session?: Thenable<vscode.AuthenticationSession>;

	public async demandForFs() {
		const session = await this.getSession();
		return new ImmyBotClient(session.accessToken);
	}

	public async request() {
		try {
			return this.demandForFs();
		} catch {
			return undefined;
		}
	}

	private getSession() {
		this.session ??= vscode.authentication.getSession('microsoft', SCOPES, {
			createIfNone: true,
		});

		return this.session;
	}
}
// This method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "immybot" is now active in the web extension host!');
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	context.subscriptions.push(vscode.commands.registerCommand('immybot.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from immybot in a web extension host! POOOOOP!!');
	}));
	context.subscriptions.push(
		vscode.commands.registerCommand('immybot.signIn', async () => {
			await signIn();
		}));
}


async function signIn() {
	const session = await vscode.authentication.getSession('microsoft', SCOPES, { createIfNone: true });
	console.log(session);

	const client = new ImmyBotClient(session!.accessToken);
	const response = await client.fetchJson<any>('/api/v1/computers');
	console.log(response);
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}
// This method is called when your extension is deactivated
export function deactivate() {
	// Noop
}
