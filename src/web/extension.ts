/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { MemFS } from './fileSystemProvider';
import { ImmyBotClient } from './immyBotClient';

const CLIENT_ID = 'f72a44d4-d2d4-450e-a2db-76b307cd045f';
const SCOPES = [
	`VSCODE_CLIENT_ID:${CLIENT_ID}`,
	`VSCODE_TENANT:common`,
	'profile',
	'openid',
	'offline_access',
	'Files.ReadWrite',
];

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


	const memFs = new MemFS();
	context.subscriptions.push(vscode.workspace.registerFileSystemProvider('memfs', memFs, { isCaseSensitive: true }));
	let initialized = false;

	context.subscriptions.push(vscode.commands.registerCommand('memfs.reset', _ => {
		for (const [name] of memFs.readDirectory(vscode.Uri.parse('memfs:/'))) {
			memFs.delete(vscode.Uri.parse(`memfs:/${name}`));
		}
		initialized = false;
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

	context.subscriptions.push(vscode.commands.registerCommand('memfs.init', async _ => {
		// if (initialized) {
		// 	return;
		// }

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
			Integration
		}

		initialized = true;
		const session = await vscode.authentication.getSession('microsoft', SCOPES, { createIfNone: true });
		console.log(session);
		if (session !== undefined && session.accessToken !== undefined) {
			vscode.window.showInformationMessage('Fetching scripts');
			const client = new ImmyBotClient(session!.accessToken);
			const response = await client.fetchJson<any>('/api/v1/scripts');
			console.log(response);

			response.forEach((script: any) => {
				const extension = script.scriptCategory === 11 ? '.psm1' : '.ps1';
				const fileName = `memfs:/${ScriptCategory[script.scriptCategory]}/${script.Name}${extension}`;
				memFs.writeFile(vscode.Uri.parse(fileName), Buffer.from(script.action), { create: true, overwrite: true });
			});
		}
	}));
	context.subscriptions.push(vscode.commands.registerCommand('memfs.workspaceInit', _ => {
		vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('memfs:/'), name: "MemFS - Sample" });
	}));
}

async function signIn() {
	const session = await vscode.authentication.getSession('microsoft', SCOPES, { createIfNone: true });
	console.log(session);
	if (session !== undefined && session.accessToken !== undefined) {
		vscode.window.showInformationMessage('Signed in as ' + session.account.label);
		const client = new ImmyBotClient(session!.accessToken);
		const response = await client.fetchJson<any>('/api/v1/scripts');
		console.log(response);
	}
}



// This method is called when your extension is deactivated
export function deactivate() {
	// Noop
}
