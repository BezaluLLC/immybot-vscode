/**
 * Common types, enums, and interfaces for the ImmyBot VS Code extension
 */
import * as vscode from 'vscode';

// Define script categories enum
export enum ScriptCategory {
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

// Authentication constants
export const IMMYBOT_CLIENT_ID = '1c8f6b7f-8397-48f4-9880-75460ab61bab';
export const SCOPES = [
	`VSCODE_CLIENT_ID:${IMMYBOT_CLIENT_ID}`,
	`VSCODE_TENANT:common`,
	"offline_access", // Required for the refresh token.
	"https://graph.microsoft.com/User.Read",
];

// TreeView item class
export class ImmyBotTreeItem extends vscode.TreeItem {
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

// Extension state interface
export interface ExtensionState {
	initialized: boolean;
	session?: vscode.AuthenticationSession;
	authOutputChannel?: vscode.OutputChannel;
	extensionContext?: vscode.ExtensionContext;
	firstName: string;
	instanceUrl?: string;
	immyBotAccessToken?: string;
}