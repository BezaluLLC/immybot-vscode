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

// Define script categories enum at the module level
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

// Default client ID - users should configure their own for production use
const DEFAULT_CLIENT_ID = 'f72a44d4-d2d4-450e-a2db-76b307cd045f';

// Get client ID from configuration or use default
function getClientId(): string {
	const config = vscode.workspace.getConfiguration('immybot');
	const configuredClientId = config.get<string>('azureClientId');
	return configuredClientId && configuredClientId.trim() !== '' ? configuredClientId : DEFAULT_CLIENT_ID;
}

// Get tenant from configuration or use default
function getTenant(): string {
	const config = vscode.workspace.getConfiguration('immybot');
	return config.get<string>('azureTenant') || 'common';
}

// Build scopes dynamically based on configuration
function buildScopes(): string[] {
	const clientId = getClientId();
	const tenant = getTenant();
	
	return [
		`VSCODE_CLIENT_ID:${clientId}`,
		`VSCODE_TENANT:${tenant}`,
		'profile',
		'openid',
		'offline_access',
		'Files.ReadWrite',
	];
}
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
			if (element.label === 'Software') {
				return Promise.resolve([
					new ImmyBotTreeItem('Detection', vscode.TreeItemCollapsibleState.Collapsed),
					new ImmyBotTreeItem('Download', vscode.TreeItemCollapsibleState.Collapsed),
					new ImmyBotTreeItem('Dynamic Version', vscode.TreeItemCollapsibleState.Collapsed),
					new ImmyBotTreeItem('Action (Install|Uninstall|Upgrade)', vscode.TreeItemCollapsibleState.Collapsed)
				]);
			} else if (element.label === 'Deployment') {
				return Promise.resolve([
					new ImmyBotTreeItem('Filter', vscode.TreeItemCollapsibleState.Collapsed),
					new ImmyBotTreeItem('Metascript', vscode.TreeItemCollapsibleState.Collapsed)
				]);
			} else if (element.label === 'Detection' || 
				element.label === 'Download' || 
				element.label === 'Dynamic Version' || 
				element.label === 'Action (Install|Uninstall|Upgrade)' ||
				element.label === 'Filter' ||
				element.label === 'Metascript' ||
				element.label === 'Functions' ||
				element.label === 'Modules' ||
				element.label === 'Task' ||
				element.label === 'Inventory' ||
				element.label === 'Preflight' ||
				element.label === 'Integration' ||
				element.label === 'System'
			) {
				// For leaf categories, list files from the corresponding directory
				try {
					const rootFolder = this.repoType === 'local' ? 'My Scripts' : 'Global Scripts';
					let parentFolder = '';
					let dirPath = '';
					
					// Find the parent of this node to determine the full path
					if (element.label === 'Detection' || 
						element.label === 'Download' || 
						element.label === 'Dynamic Version' || 
						element.label === 'Action (Install|Uninstall|Upgrade)') {
						parentFolder = 'Software';
					} else if (element.label === 'Filter' || element.label === 'Metascript') {
						parentFolder = 'Deployment';
					} else {
						// Top-level folders
						parentFolder = '';
					}
					
					// Construct the directory path
					if (parentFolder) {
						dirPath = `memfs:/${rootFolder}/${parentFolder}/${element.label}`;
					} else {
						dirPath = `memfs:/${rootFolder}/${element.label}`;
					}
					
					const dirUri = vscode.Uri.parse(dirPath);
					const dirEntries = memFs.readDirectory(dirUri);
					const fileItems: ImmyBotTreeItem[] = [];
					
					for (const [name, type] of dirEntries) {
						if (type === vscode.FileType.File) {
							const fileUri = vscode.Uri.parse(`${dirPath}/${name}`);
							const fileItem = new ImmyBotTreeItem(name, vscode.TreeItemCollapsibleState.None);
							fileItem.resourceUri = fileUri;
							fileItem.command = {
								command: 'vscode.open',
								arguments: [fileUri],
								title: 'Open File'
							};
							fileItems.push(fileItem);
						}
					}
					
					// Sort files alphabetically
					fileItems.sort((a, b) => {
						return a.label!.toString().localeCompare(b.label!.toString());
					});
					
					return Promise.resolve(fileItems);
				} catch (e) {
					console.error('Error listing files:', e);
					return Promise.resolve([]);
				}
			}
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
	
	// Create file command
	context.subscriptions.push(
		vscode.commands.registerCommand('immybot.createFile', async () => {
			if (!initialized) {
				vscode.window.showErrorMessage('Please sign in first.');
				return;
			}
			
			try {
				// First, choose Script Type: Local or Global
				const scriptTypeOptions = [
					{ label: 'Local Script', description: 'Tenant-specific script', value: 1 },
					{ label: 'Global Script', description: 'Shared across tenants', value: 2 }
				];
				
				const selectedScriptType = await vscode.window.showQuickPick(scriptTypeOptions, {
					placeHolder: 'Select Script Type'
				});
				
				if (!selectedScriptType) {
					return; // User cancelled
				}
				
				// Next, choose Script Language
				const scriptLanguageOptions = [
					{ label: 'Command Line', description: 'Command Line script', value: 1 },
					{ label: 'PowerShell', description: 'PowerShell script', value: 2 }
				];
				
				const selectedLanguage = await vscode.window.showQuickPick(scriptLanguageOptions, {
					placeHolder: 'Select Script Language'
				});
				
				if (!selectedLanguage) {
					return; // User cancelled
				}
				
				// Then, choose Execution Context
				const executionContextOptions = [
					{ label: 'System', description: 'System execution context', value: 0 },
					{ label: 'User', description: 'User execution context', value: 1 },
					{ label: 'Metascript', description: 'Metascript execution context', value: 2 },
					{ label: 'CloudScript', description: 'CloudScript execution context', value: 4 }
				];
				
				const selectedExecutionContext = await vscode.window.showQuickPick(executionContextOptions, {
					placeHolder: 'Select Execution Context'
				});
				
				if (!selectedExecutionContext) {
					return; // User cancelled
				}
				
				// Top-level categories first
				const scriptCategoryOptions = [
					{ label: 'Modules', description: 'PowerShell module scripts', value: 11, dataType: 'Module' },
					{ label: 'Functions', description: 'Function scripts', value: 7, dataType: 'Function' },
					{ label: 'Software', description: 'Software-related scripts', value: -1, dataType: 'Software' },
					{ label: 'Task', description: 'Maintenance task scripts', value: 3, dataType: 'MaintenanceTaskSetter' },
					{ label: 'Inventory', description: 'Device inventory scripts', value: 6, dataType: 'DeviceInventory' },
					{ label: 'Preflight', description: 'Preflight scripts', value: 12, dataType: 'Preflight' },
					{ label: 'Integration', description: 'Integration scripts', value: 13, dataType: 'Integration' },
					{ label: 'Deployment', description: 'Deployment-related scripts', value: -2, dataType: 'Deployment' }
				];
					
				const selectedMainCategory = await vscode.window.showQuickPick(scriptCategoryOptions, {
					placeHolder: 'Select a main category'
				});
				
				if (!selectedMainCategory) {
					return; // User cancelled
				}
				
				// Handle subcategories for Software and Deployment
				let selectedSubCategory = selectedMainCategory;
				
				if (selectedMainCategory.value === -1) { // Software
					const softwareSubCategories = [
						{ label: 'Detection', description: 'Software detection scripts', value: 0, dataType: 'SoftwareDetection' },
						{ label: 'Download', description: 'Installer download scripts', value: 10, dataType: 'DownloadInstaller' },
						{ label: 'Dynamic Version', description: 'Dynamic version scripts', value: 9, dataType: 'DynamicVersions' },
						{ label: 'Action (Install|Uninstall|Upgrade)', description: 'Software action scripts', value: 2, dataType: 'SoftwareVersionAction' }
					];
					
					const selectedSoftwareSubCategory = await vscode.window.showQuickPick(softwareSubCategories, {
						placeHolder: 'Select a software subcategory'
					});
					
					if (!selectedSoftwareSubCategory) {
						return; // User cancelled
					}
					
					selectedSubCategory = selectedSoftwareSubCategory;
				} else if (selectedMainCategory.value === -2) { // Deployment
					const deploymentSubCategories = [
						{ label: 'Filter', description: 'Deployment filter scripts', value: 5, dataType: 'FilterScriptDeploymentTarget' },
						{ label: 'Metascript', description: 'Deployment metascript', value: 4, dataType: 'MetascriptDeploymentTarget' }
					];
					
					const selectedDeploymentSubCategory = await vscode.window.showQuickPick(deploymentSubCategories, {
						placeHolder: 'Select a deployment subcategory'
					});
					
					if (!selectedDeploymentSubCategory) {
						return; // User cancelled
					}
					
					selectedSubCategory = selectedDeploymentSubCategory;
				}
				
				// Get the file name from user
				const fileName = await vscode.window.showInputBox({
					prompt: `Enter file name for ${selectedSubCategory.label} (without extension)`,
					placeHolder: 'MyNewScript'
				});
				
				if (!fileName) {
					return; // User cancelled
				}
				
				// Determine extension based on language (PowerShell .ps1 or .psm1 for modules, .cmd for command line)
				const isModule = selectedSubCategory.value === 11; // Module category
				let extension = '';
				
				if (selectedLanguage.value === 2) { // PowerShell
					extension = isModule ? '.psm1' : '.ps1';
				} else {
					extension = '.cmd';
				}
				
				// Create the new file
				let fileUri;
				const rootFolder = selectedScriptType.value === 1 ? 'My Scripts' : 'Global Scripts';
				
				// Create the full folder path based on the category
				let folderPath = '';
				
				if (selectedMainCategory.value === -1) { // Software
					switch (selectedSubCategory.value) {
						case 0: // Detection
							folderPath = `${rootFolder}/Software/Detection`;
							break;
						case 10: // Download
							folderPath = `${rootFolder}/Software/Download`;
							break;
						case 9: // Dynamic Version
							folderPath = `${rootFolder}/Software/Dynamic Version`;
							break;
						case 2: // Action
							folderPath = `${rootFolder}/Software/Action (Install|Uninstall|Upgrade)`;
							break;
						default:
							folderPath = `${rootFolder}/Software`;
					}
				} else if (selectedMainCategory.value === -2) { // Deployment
					switch (selectedSubCategory.value) {
						case 5: // Filter
							folderPath = `${rootFolder}/Deployment/Filter`;
							break;
						case 4: // Metascript
							folderPath = `${rootFolder}/Deployment/Metascript`;
							break;
						default:
							folderPath = `${rootFolder}/Deployment`;
					}
				} else {
					// Map main categories to folder paths
					switch (selectedSubCategory.value) {
						case 7: // Function
							folderPath = `${rootFolder}/Functions`;
							break;
						case 11: // Module
							folderPath = `${rootFolder}/Modules`;
							break;
						case 3: // MaintenanceTaskSetter
							folderPath = `${rootFolder}/Task`;
							break;
						case 6: // DeviceInventory
							folderPath = `${rootFolder}/Inventory`;
							break;
						case 12: // Preflight
							folderPath = `${rootFolder}/Preflight`;
							break;
						case 13: // Integration
							folderPath = `${rootFolder}/Integration`;
							break;
						default:
							folderPath = `${rootFolder}/${selectedSubCategory.dataType}`;
					}
				}
				
				fileUri = vscode.Uri.parse(`memfs:/${folderPath}/${fileName}${extension}`);
				
				// Get user email if available or username from session
				const userEmail = session?.account?.label || 'Unknown User';
				
				// Current date in UTC format
				const currentDate = new Date().toISOString();
				
				// Default content based on category with metadata
				let defaultContent = '';
				
				// Add metadata header
				defaultContent += `<#\n`;
				defaultContent += `METADATA\n`;
				defaultContent += `ScriptType: ${selectedScriptType.value} (${selectedScriptType.label})\n`;
				defaultContent += `ScriptCategory: ${selectedSubCategory.value} (${selectedSubCategory.label})\n`;
				defaultContent += `ExecutionContext: ${selectedExecutionContext.value} (${selectedExecutionContext.label})\n`;
				defaultContent += `Language: ${selectedLanguage.value} (${selectedLanguage.label})\n`;
				defaultContent += `CreatedBy: ${userEmail}\n`;
				defaultContent += `CreatedDate: ${currentDate}\n`;
				defaultContent += `#>\n\n`;
				
				// Add script content based on category
				if (isModule) {
					defaultContent += `# ${fileName} Module\n\nfunction Get-${fileName}Info {\n    [CmdletBinding()]\n    param()\n    \n    Write-Output "Hello from ${fileName} module"\n}\n\nExport-ModuleMember -Function Get-${fileName}Info`;
				} else if (selectedSubCategory.value === 0) { // SoftwareDetection
					defaultContent += `# ${fileName} Software Detection Script\n\n[CmdletBinding()]\nparam()\n\n# Return detection status (0 = Not Installed, 1 = Installed, 2 = Needs Update)\nReturn 0`;
				} else if (selectedSubCategory.value === 10) { // DownloadInstaller
					defaultContent += `# ${fileName} Download Script\n\n[CmdletBinding()]\nparam()\n\n# Return download URL for the installer\nReturn "https://example.com/${fileName}.exe"`;
				} else if (selectedSubCategory.value === 9) { // DynamicVersions
					defaultContent += `# ${fileName} Dynamic Version Script\n\n[CmdletBinding()]\nparam()\n\n# Return latest version number\nReturn "1.0.0"`;
				} else if (selectedSubCategory.value === 2) { // SoftwareVersionAction
					defaultContent += `# ${fileName} Software Action Script\n\n[CmdletBinding()]\nparam()\n\n# Installation logic here\nWrite-Output "Installing ${fileName}"`;
				} else if (selectedSubCategory.value === 5) { // FilterScriptDeploymentTarget
					defaultContent += `# ${fileName} Deployment Filter Script\n\n[CmdletBinding()]\nparam()\n\n# Return true to include device, false to exclude\nReturn $true`;
				} else if (selectedSubCategory.value === 4) { // MetascriptDeploymentTarget
					defaultContent += `# ${fileName} Deployment Metascript\n\n[CmdletBinding()]\nparam()\n\n# Deployment logic here\nWrite-Output "Deploying ${fileName}"`;
				} else if (selectedSubCategory.value === 7) { // Function
					defaultContent += `# ${fileName} Function\n\nfunction ${fileName} {\n    [CmdletBinding()]\n    param()\n    \n    Write-Output "Executing ${fileName} function"\n}\n\n# Export the function\n${fileName}`;
				} else if (selectedSubCategory.value === 6) { // DeviceInventory
					defaultContent += `# ${fileName} Device Inventory Script\n\n[CmdletBinding()]\nparam()\n\n# Return inventory data\n@{\n    Name = "${fileName}"\n    Value = "Sample inventory data"\n}`;
				} else if (selectedSubCategory.value === 12) { // Preflight
					defaultContent += `# ${fileName} Preflight Script\n\n[CmdletBinding()]\nparam()\n\n# Preflight check logic\n$result = $true\n\n# Return true if preflight check passes, false otherwise\nReturn $result`;
				} else if (selectedSubCategory.value === 13) { // Integration
					defaultContent += `# ${fileName} Integration Script\n\n[CmdletBinding()]\nparam()\n\n# Integration logic\nWrite-Output "Executing ${fileName} integration script"`;
				} else if (selectedSubCategory.value === 3) { // MaintenanceTaskSetter
					defaultContent += `# ${fileName} Maintenance Task Script\n\n[CmdletBinding()]\nparam()\n\n# Task logic\nWrite-Output "Executing ${fileName} maintenance task"`;
				} else {
					defaultContent += `# ${fileName} Script\n\n[CmdletBinding()]\nparam()\n\nWrite-Output "Hello from ${fileName} script"`;
				}
				
				// Write the file
				memFs.writeFile(fileUri, Buffer.from(defaultContent), { create: true, overwrite: false });
				
				// Open the file
				const document = await vscode.workspace.openTextDocument(fileUri);
				await vscode.window.showTextDocument(document);
				
				vscode.window.showInformationMessage(`Created new file: ${fileName}${extension}`);
				
				// Refresh the views
				localRepoProvider.refresh();
				globalRepoProvider.refresh();
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Failed to create file: ${errorMessage}`);
				console.error('Error creating file:', error);
			}
		})
	);
	
	// Delete file command
	context.subscriptions.push(
		vscode.commands.registerCommand('immybot.deleteFile', async () => {
			if (!initialized) {
				vscode.window.showErrorMessage('Please sign in first.');
				return;
			}
			
			try {
				// Build a list of directories to scan with the new structure
				const rootFolders = ['My Scripts', 'Global Scripts'];
				const subFolders = [
					'Functions',
					'Modules',
					'Software',
					'Task',
					'Inventory',
					'Preflight',
					'Integration',
					'Deployment',
					'System',
					'Unknown'
				];
				
				const softwareSubFolders = [
					'Detection',
					'Download',
					'Dynamic Version',
					'Action (Install|Uninstall|Upgrade)'
				];
				
				const deploymentSubFolders = [
					'Filter',
					'Metascript'
				];
				
				const files: { label: string; uri: vscode.Uri }[] = [];
				
				// Scan all directories in the new structure
				for (const rootFolder of rootFolders) {
					for (const subFolder of subFolders) {
						// Special handling for Software and Deployment which have subfolders
						if (subFolder === 'Software') {
							for (const softwareSubFolder of softwareSubFolders) {
								try {
									const dirUri = vscode.Uri.parse(`memfs:/${rootFolder}/${subFolder}/${softwareSubFolder}`);
									const dirEntries = memFs.readDirectory(dirUri);
									
									for (const [name, type] of dirEntries) {
										if (type === vscode.FileType.File) {
											files.push({
												label: `${rootFolder}/${subFolder}/${softwareSubFolder}/${name}`,
												uri: vscode.Uri.parse(`memfs:/${rootFolder}/${subFolder}/${softwareSubFolder}/${name}`)
											});
										}
									}
								} catch (e) {
									// Ignore errors for directories that might not exist
								}
							}
						} else if (subFolder === 'Deployment') {
							for (const deploymentSubFolder of deploymentSubFolders) {
								try {
									const dirUri = vscode.Uri.parse(`memfs:/${rootFolder}/${subFolder}/${deploymentSubFolder}`);
									const dirEntries = memFs.readDirectory(dirUri);
									
									for (const [name, type] of dirEntries) {
										if (type === vscode.FileType.File) {
											files.push({
												label: `${rootFolder}/${subFolder}/${deploymentSubFolder}/${name}`,
												uri: vscode.Uri.parse(`memfs:/${rootFolder}/${subFolder}/${deploymentSubFolder}/${name}`)
											});
										}
									}
								} catch (e) {
									// Ignore errors for directories that might not exist
								}
							}
						} else {
							// Regular directory
							try {
								const dirUri = vscode.Uri.parse(`memfs:/${rootFolder}/${subFolder}`);
								const dirEntries = memFs.readDirectory(dirUri);
								
								for (const [name, type] of dirEntries) {
									if (type === vscode.FileType.File) {
										files.push({
											label: `${rootFolder}/${subFolder}/${name}`,
											uri: vscode.Uri.parse(`memfs:/${rootFolder}/${subFolder}/${name}`)
										});
									}
								}
							} catch (e) {
								// Ignore errors for directories that might not exist
							}
						}
					}
				}
				
				if (files.length === 0) {
					vscode.window.showInformationMessage('No files found to delete.');
					return;
				}
				
				// Show quick pick with all files
				const selectedFile = await vscode.window.showQuickPick(files, {
					placeHolder: 'Select a file to delete'
				});
				
				if (!selectedFile) {
					return; // User cancelled
				}
				
				// Confirm deletion
				const confirmation = await vscode.window.showWarningMessage(
					`Are you sure you want to delete ${selectedFile.label}?`,
					{ modal: true },
					'Delete'
				);
				
				if (confirmation !== 'Delete') {
					return; // User cancelled
				}
				
				// Delete the file
				memFs.delete(selectedFile.uri);
				
				vscode.window.showInformationMessage(`Deleted file: ${selectedFile.label}`);
				
				// Refresh the views
				localRepoProvider.refresh();
				globalRepoProvider.refresh();
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Failed to delete file: ${errorMessage}`);
				console.error('Error deleting file:', error);
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
						const scopes = buildScopes();
						
						// 1. Clear session preference
						await vscode.authentication.getSession('microsoft', scopes, { 
							clearSessionPreference: true 
						});
						
						// 2. For VS Code versions that support it, try to get all sessions and remove them
						// This may not work in all VS Code versions, so we catch any errors
						try {
							// @ts-ignore - getSessions might exist in newer VS Code versions
							const allSessions = await vscode.authentication.getSessions?.('microsoft', scopes);
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
		const scopes = buildScopes();
		const clientId = getClientId();
		const tenant = getTenant();
		
		// Log authentication attempt details
		authOutputChannel.appendLine(`Authentication attempt:`);
		authOutputChannel.appendLine(`  Client ID: ${clientId}`);
		authOutputChannel.appendLine(`  Tenant: ${tenant}`);
		authOutputChannel.appendLine(`  Scopes: ${scopes.join(', ')}`);
		authOutputChannel.appendLine(`  Prompt for auth: ${promptForAuth}`);
		
		// Check if we need to force a new session (set during sign-out)
		// Use globalState instead of workspaceState for better persistence
		const forceNewSession = extensionContext.globalState.get('immybot.forceNewSession', false);
		
		// If we're explicitly signing in and a new session is forced, use forceNewSession
		if (promptForAuth && forceNewSession) {
			// Clear the flag so we don't force new sessions forever
			await extensionContext.globalState.update('immybot.forceNewSession', false);
			
			// Force a completely new authentication
			session = await vscode.authentication.getSession('microsoft', scopes, { 
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
			existingSession = await vscode.authentication.getSession('microsoft', scopes, { 
				createIfNone: false,
				silent: !promptForAuth // Only show UI if explicitly requested
			});
		} catch (e) {
			// Log authentication errors with more detail
			const errorMessage = e instanceof Error ? e.message : String(e);
			authOutputChannel.appendLine(`Error checking for existing session: ${errorMessage}`);
			
			// Check for specific Azure AD errors
			if (errorMessage.includes('AADSTS900971')) {
				const azureErrorMsg = `Azure AD Error AADSTS900971: No reply address provided.

This error indicates that your Azure AD app registration is missing required redirect URIs for VS Code authentication.

To fix this issue:
1. Go to your Azure AD app registration (Client ID: ${clientId})
2. Navigate to "Authentication" section
3. Add these redirect URIs:
   - https://vscode.dev/redirect
   - vscode://vscode.github-authentication/did-authenticate
4. Save the configuration

Alternatively, you can:
- Configure a custom Client ID in VS Code settings (immybot.azureClientId)
- Create a new Azure AD app registration with the proper redirect URIs configured`;

				vscode.window.showErrorMessage('Azure AD Authentication Configuration Error', 'Show Details', 'Open Settings').then(async (choice) => {
					if (choice === 'Show Details') {
						authOutputChannel.appendLine(`\n${azureErrorMsg}`);
						authOutputChannel.show();
					} else if (choice === 'Open Settings') {
						vscode.commands.executeCommand('workbench.action.openSettings', 'immybot.azureClientId');
					}
				});
				
				authOutputChannel.appendLine(azureErrorMsg);
				return false;
			} else if (errorMessage.includes('AADSTS')) {
				// Handle other Azure AD errors
				const azureErrorMsg = `Azure AD Authentication Error: ${errorMessage}

This may be due to:
- App registration configuration issues
- Tenant access restrictions  
- Invalid client ID or scopes

Current configuration:
- Client ID: ${clientId}
- Tenant: ${tenant}
- Scopes: ${scopes.join(', ')}

You can configure custom authentication settings in VS Code settings (immybot.azureClientId, immybot.azureTenant).`;

				vscode.window.showErrorMessage('Azure AD Authentication Error', 'Show Details', 'Open Settings').then(async (choice) => {
					if (choice === 'Show Details') {
						authOutputChannel.appendLine(`\n${azureErrorMsg}`);
						authOutputChannel.show();
					} else if (choice === 'Open Settings') {
						vscode.commands.executeCommand('workbench.action.openSettings', 'immybot');
					}
				});
				
				authOutputChannel.appendLine(azureErrorMsg);
				return false;
			}
			
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
			session = await vscode.authentication.getSession('microsoft', scopes, { 
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
		const errorMessage = error instanceof Error ? error.message : String(error);
		
		// Enhanced error logging and user guidance
		authOutputChannel.appendLine(`Authentication failed: ${errorMessage}`);
		
		// Check for specific error patterns and provide targeted guidance
		if (errorMessage.includes('AADSTS900971')) {
			const clientId = getClientId();
			const guidance = `Azure AD Error AADSTS900971: No reply address provided.

Your Azure AD app registration (${clientId}) needs to be configured with these redirect URIs:
- https://vscode.dev/redirect
- vscode://vscode.github-authentication/did-authenticate

Please update your Azure AD app registration or configure a different Client ID in settings.`;
			
			vscode.window.showErrorMessage('Authentication Configuration Error', 'Show Solution', 'Open Settings').then(async (choice) => {
				if (choice === 'Show Solution') {
					authOutputChannel.appendLine(`\n${guidance}`);
					authOutputChannel.show();
				} else if (choice === 'Open Settings') {
					vscode.commands.executeCommand('workbench.action.openSettings', 'immybot.azureClientId');
				}
			});
		} else {
			vscode.window.showErrorMessage(`Authentication error: ${errorMessage}`, 'Show Details').then((choice) => {
				if (choice === 'Show Details') {
					authOutputChannel.show();
				}
			});
		}
		
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

	// Create top-level directories for Local and Global scripts
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts'));

	// Create subdirectories under My Scripts
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Modules'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Functions'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Software'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Task'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Inventory'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Preflight'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Integration'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Deployment'));

	// Create subdirectories under Global Scripts
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Modules'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Functions'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Software'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Task'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Inventory'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Preflight'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Integration'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Deployment'));

	// Create Software subcategories
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Software/Detection'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Software/Download'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Software/Dynamic Version'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Software/Action (Install|Uninstall|Upgrade)'));
	
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Software/Detection'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Software/Download'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Software/Dynamic Version'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Software/Action (Install|Uninstall|Upgrade)'));

	// Create Deployment subcategories
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Deployment/Filter'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/My Scripts/Deployment/Metascript'));
	
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Deployment/Filter'));
	memFs.createDirectory(vscode.Uri.parse('memfs:/Global Scripts/Deployment/Metascript'));

	vscode.window.showInformationMessage('Fetching scripts');
	if (response && Array.isArray(response)) {
		response.forEach((script: any) => {
			if (script && typeof script.scriptCategory !== 'undefined' && script.name && script.action) {
				const extension = script.scriptLanguage === 2 ? (script.scriptCategory === 11 ? '.psm1' : '.ps1') : '.cmd';
				let fileName = '';
				let folderPath = '';
				
				// Determine the root folder based on script type
				const rootFolder = script.scriptType === 1 ? 'My Scripts' : 'Global Scripts';
				
				// Map script category to the appropriate folder structure
				switch (script.scriptCategory) {
					case 0: // SoftwareDetection
						folderPath = `${rootFolder}/Software/Detection`;
						break;
					case 1: // SoftwareAutoUpdate (deprecated)
						folderPath = `${rootFolder}/Software/Action (Install|Uninstall|Upgrade)`;
						break;
					case 2: // SoftwareVersionAction
						folderPath = `${rootFolder}/Software/Action (Install|Uninstall|Upgrade)`;
						break;
					case 3: // MaintenanceTaskSetter
						folderPath = `${rootFolder}/Task`;
						break;
					case 4: // MetascriptDeploymentTarget
						folderPath = `${rootFolder}/Deployment/Metascript`;
						break;
					case 5: // FilterScriptDeploymentTarget
						folderPath = `${rootFolder}/Deployment/Filter`;
						break;
					case 6: // DeviceInventory
						folderPath = `${rootFolder}/Inventory`;
						break;
					case 7: // Function
						folderPath = `${rootFolder}/Functions`;
						break;
					case 8: // ImmySystem
						folderPath = `${rootFolder}/System`;
						break;
					case 9: // DynamicVersions
						folderPath = `${rootFolder}/Software/Dynamic Version`;
						break;
					case 10: // DownloadInstaller
						folderPath = `${rootFolder}/Software/Download`;
						break;
					case 11: // Module
						folderPath = `${rootFolder}/Modules`;
						break;
					case 12: // Preflight
						folderPath = `${rootFolder}/Preflight`;
						break;
					case 13: // Integration
						folderPath = `${rootFolder}/Integration`;
						break;
					default:
						folderPath = `${rootFolder}/Unknown`;
				}
				
				fileName = `memfs:/${folderPath}/${script.name}${extension}`;
				
				// Add metadata to the script content
				let scriptContent = script.action;
				
				// Only add metadata if it doesn't already exist and it's a PowerShell script
				if (script.scriptLanguage === 2 && !scriptContent.includes('<#\nMETADATA')) {
					// Map execution context to friendly name
					let executionContextName = 'Unknown';
					switch (script.scriptExecutionContext) {
						case 0: executionContextName = 'System'; break;
						case 1: executionContextName = 'User'; break;
						case 2: executionContextName = 'Metascript'; break;
						case 4: executionContextName = 'CloudScript'; break;
					}
					
					// Map script type to friendly name
					let scriptTypeName = script.scriptType === 1 ? 'Local Script' : 'Global Script';
					
					// Map script category to friendly name
					let scriptCategoryName = ScriptCategory[script.scriptCategory] || 'Unknown';
					
					// Map language to friendly name
					let languageName = script.scriptLanguage === 2 ? 'PowerShell' : 'Command Line';
					
					// Create metadata block
					const metadata = `<#\nMETADATA
ScriptType: ${script.scriptType} (${scriptTypeName})
ScriptCategory: ${script.scriptCategory} (${scriptCategoryName})
ExecutionContext: ${script.scriptExecutionContext} (${executionContextName})
Language: ${script.scriptLanguage} (${languageName})
CreatedBy: ${script.updatedBy || 'Unknown'}
CreatedDate: ${script.createdDateUTC || new Date().toISOString()}
LastUpdated: ${script.updatedDateUTC || new Date().toISOString()}
#>\n\n`;
					
					scriptContent = metadata + scriptContent;
				}
				
				try {
					memFs.writeFile(vscode.Uri.parse(fileName), Buffer.from(scriptContent), { create: true, overwrite: true });
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
