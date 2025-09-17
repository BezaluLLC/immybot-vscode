/**
 * Command registration and handlers for ImmyBot VS Code extension
 */
import * as vscode from 'vscode';
import { ExtensionState } from './types';
import { ImmyBotFileSystemProvider } from './immyBotFileSystemProvider';
import { ImmyBotScriptTreeDataProvider } from './treeProvider';
import { ScriptManager } from './scriptManager';
import { attemptSignIn, updateEditorContext } from './authentication';
import { startLanguageServerAndClient } from './languageServer';

// Type definitions for script creation options
interface ScriptOption {
	label: string;
	description: string;
	value: number;
	dataType?: string;
}

interface CategorySelectionResult {
	selectedSubCategory?: ScriptOption;
	fileName?: string;
	fileUri?: vscode.Uri;
	defaultContent?: string;
}

export function registerCommands(
	context: vscode.ExtensionContext,
	state: ExtensionState,
	updateState: (updates: Partial<ExtensionState>) => void,
	immyFs: ImmyBotFileSystemProvider,
	localRepoProvider: ImmyBotScriptTreeDataProvider,
	globalRepoProvider: ImmyBotScriptTreeDataProvider,
	getScriptManager: () => ScriptManager
) {
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
			state.authOutputChannel?.appendLine('Refreshing scripts from ImmyBot server');
			try {
				// Get the current scriptManager instance
				const currentScriptManager = getScriptManager();
				
				// Ensure the script manager has the current access token
				if (state.immyBotAccessToken) {
					currentScriptManager.setAccessToken(state.immyBotAccessToken);
				}
				
				await currentScriptManager.fetchScripts();
				vscode.window.showInformationMessage('Scripts refreshed successfully');
				// Refresh the tree views
				localRepoProvider.refresh();
				globalRepoProvider.refresh();
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Failed to refresh scripts: ${errorMessage}`);
				state.authOutputChannel?.appendLine(`Error refreshing scripts: ${errorMessage}`);
			}
		})
	);

	// Create file command
	context.subscriptions.push(
		vscode.commands.registerCommand('immybot.createFile', async () => {
			await handleCreateFile(state, immyFs, localRepoProvider, globalRepoProvider);
		})
	);

	// Delete file command
	context.subscriptions.push(
		vscode.commands.registerCommand('immybot.deleteFile', async () => {
			await handleDeleteFile(state, immyFs, localRepoProvider, globalRepoProvider);
		})
	);

	// Sign in command
	context.subscriptions.push(
		vscode.commands.registerCommand('immybot.signIn', async () => {
			vscode.window.showInformationMessage('Sign In command triggered - starting authentication...');
			
			try {
				// Check for instanceUrl first
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
					
					if (!instanceUrl) {
						vscode.window.showErrorMessage('Instance URL is required for sign in');
						return;
					}
					
					// Save to user settings
					await config.update('instanceUrl', instanceUrl, vscode.ConfigurationTarget.Global);
				}
				
				// Update state with instanceUrl
				updateState({ instanceUrl });
				
				// Log the instance URL for debugging
				state.authOutputChannel?.appendLine(`Sign In: Instance URL set to: ${instanceUrl}`);
				
				// Only proceed with authentication when explicitly requested by user
				const result = await attemptSignIn(true, state, updateState, async () => {
					// Get the current scriptManager instance and fetch scripts
					const currentScriptManager = getScriptManager();
					// Update the script manager with the new access token
					if (state.immyBotAccessToken) {
						currentScriptManager.setAccessToken(state.immyBotAccessToken);
					}
					state.authOutputChannel?.appendLine('Sign In: About to fetch scripts...');
					await currentScriptManager.fetchScripts();
					state.authOutputChannel?.appendLine('Sign In: Scripts fetched successfully');
				});
				} catch (error) {
				vscode.window.showErrorMessage(`Sign In failed: ${error instanceof Error ? error.message : String(error)}`);
			}
		})
	);

	// Sign out command
	context.subscriptions.push(
		vscode.commands.registerCommand('immybot.signOut', async () => {
			// Clear authentication state
			updateState({ 
				initialized: false,
				session: undefined,
				firstName: 'User'
			});
			
			// Set context to update sidebar visibility
			await vscode.commands.executeCommand('setContext', 'immybot:authenticated', false);
			vscode.window.showInformationMessage('Signed out successfully');
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
			if (document.uri.scheme === 'immyfs') {
				if (document.languageId === 'metascript') {
					await startLanguageServerAndClient(context);
				}
			}
		})
	);

	// Register immyfs commands
	registerMemfsCommands(context, state, immyFs);
}

async function handleCreateFile(
	state: ExtensionState, 
	immyFs: ImmyBotFileSystemProvider, 
	localRepoProvider: ImmyBotScriptTreeDataProvider, 
	globalRepoProvider: ImmyBotScriptTreeDataProvider
) {
	if (!state.initialized) {
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

		// Get category and subcategory selections
		const { selectedSubCategory, fileName, fileUri, defaultContent } = await handleCategorySelection(
			selectedScriptType, 
			selectedLanguage, 
			selectedExecutionContext,
			state
		);

		if (!selectedSubCategory || !fileName || !fileUri) {
			return; // User cancelled
		}

		// Write the file
		immyFs.writeFile(fileUri, Buffer.from(defaultContent || ''), { create: true, overwrite: false });

		// Open the file
		const document = await vscode.workspace.openTextDocument(fileUri);
		await vscode.window.showTextDocument(document);

		vscode.window.showInformationMessage(`Created new file: ${fileName}`);

		// Refresh the views
		localRepoProvider.refresh();
		globalRepoProvider.refresh();
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(`Failed to create file: ${errorMessage}`);
		}
}

async function handleCategorySelection(
	selectedScriptType: ScriptOption,
	selectedLanguage: ScriptOption,
	selectedExecutionContext: ScriptOption,
	state: ExtensionState
): Promise<CategorySelectionResult> {
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
		return {};
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
			return {};
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
			return {};
		}

		selectedSubCategory = selectedDeploymentSubCategory;
	}

	// Get the file name from user
	const fileNameInput = await vscode.window.showInputBox({
		prompt: `Enter file name for ${selectedSubCategory.label} (without extension)`,
		placeHolder: 'MyNewScript'
	});

	if (!fileNameInput) {
		return {};
	}

	// Create file path and content
	const result = createFilePathAndContent(
		selectedScriptType,
		selectedLanguage,
		selectedExecutionContext,
		selectedMainCategory,
		selectedSubCategory,
		fileNameInput,
		state
	);

	return { selectedSubCategory, fileName: fileNameInput, ...result };
}

function createFilePathAndContent(
	selectedScriptType: ScriptOption,
	selectedLanguage: ScriptOption,
	selectedExecutionContext: ScriptOption,
	selectedMainCategory: ScriptOption,
	selectedSubCategory: ScriptOption,
	fileName: string,
	state: ExtensionState
): { fileUri: vscode.Uri; defaultContent: string } {
	// Determine extension based on language
	const isModule = selectedSubCategory.value === 11;
	let extension = '';

	if (selectedLanguage.value === 2) { // PowerShell
		extension = isModule ? '.psm1' : '.ps1';
	} else {
		extension = '.cmd';
	}

	// Create the full folder path based on the category
	const rootFolder = selectedScriptType.value === 1 ? 'My Scripts' : 'Global Scripts';
	let folderPath = '';

	if (selectedMainCategory.value === -1) { // Software
		const softwarePaths = {
			0: 'Detection',
			10: 'Download', 
			9: 'Dynamic Version',
			2: 'Action (Install|Uninstall|Upgrade)'
		};
		folderPath = `${rootFolder}/Software/${softwarePaths[selectedSubCategory.value as keyof typeof softwarePaths] || 'Software'}`;
	} else if (selectedMainCategory.value === -2) { // Deployment
		const deploymentPaths = {
			5: 'Filter',
			4: 'Metascript'
		};
		folderPath = `${rootFolder}/Deployment/${deploymentPaths[selectedSubCategory.value as keyof typeof deploymentPaths] || 'Deployment'}`;
	} else {
		// Map main categories to folder paths
		const categoryPaths = {
			7: 'Functions',
			11: 'Modules',
			3: 'Task',
			6: 'Inventory',
			12: 'Preflight',
			13: 'Integration'
		};
		folderPath = `${rootFolder}/${categoryPaths[selectedSubCategory.value as keyof typeof categoryPaths] || selectedSubCategory.dataType}`;
	}

	const fileUri = vscode.Uri.parse(`immyfs:/${folderPath}/${fileName}${extension}`);

	// Create default content
	const defaultContent = createDefaultContent(
		selectedScriptType,
		selectedLanguage,
		selectedExecutionContext,
		selectedSubCategory,
		fileName,
		state
	);

	return { fileUri, defaultContent };
}

function createDefaultContent(
	selectedScriptType: ScriptOption,
	selectedLanguage: ScriptOption,
	selectedExecutionContext: ScriptOption,
	selectedSubCategory: ScriptOption,
	fileName: string,
	state: ExtensionState
): string {
	const userEmail = state.session?.account?.label || 'Unknown User';
	const currentDate = new Date().toISOString();

	// Add metadata header
	let defaultContent = `<#\n`;
	defaultContent += `METADATA\n`;
	defaultContent += `ScriptType: ${selectedScriptType.value} (${selectedScriptType.label})\n`;
	defaultContent += `ScriptCategory: ${selectedSubCategory.value} (${selectedSubCategory.label})\n`;
	defaultContent += `ExecutionContext: ${selectedExecutionContext.value} (${selectedExecutionContext.label})\n`;
	defaultContent += `Language: ${selectedLanguage.value} (${selectedLanguage.label})\n`;
	defaultContent += `CreatedBy: ${userEmail}\n`;
	defaultContent += `CreatedDate: ${currentDate}\n`;
	defaultContent += `#>\n\n`;

	// Add script content based on category
	const contentTemplates = {
		11: `# ${fileName} Module\n\nfunction Get-${fileName}Info {\n    [CmdletBinding()]\n    param()\n    \n    Write-Output "Hello from ${fileName} module"\n}\n\nExport-ModuleMember -Function Get-${fileName}Info`,
		0: `# ${fileName} Software Detection Script\n\n[CmdletBinding()]\nparam()\n\n# Return detection status (0 = Not Installed, 1 = Installed, 2 = Needs Update)\nReturn 0`,
		10: `# ${fileName} Download Script\n\n[CmdletBinding()]\nparam()\n\n# Return download URL for the installer\nReturn "https://example.com/${fileName}.exe"`,
		9: `# ${fileName} Dynamic Version Script\n\n[CmdletBinding()]\nparam()\n\n# Return latest version number\nReturn "1.0.0"`,
		2: `# ${fileName} Software Action Script\n\n[CmdletBinding()]\nparam()\n\n# Installation logic here\nWrite-Output "Installing ${fileName}"`,
		5: `# ${fileName} Deployment Filter Script\n\n[CmdletBinding()]\nparam()\n\n# Return true to include device, false to exclude\nReturn $true`,
		4: `# ${fileName} Deployment Metascript\n\n[CmdletBinding()]\nparam()\n\n# Deployment logic here\nWrite-Output "Deploying ${fileName}"`,
		7: `# ${fileName} Function\n\nfunction ${fileName} {\n    [CmdletBinding()]\n    param()\n    \n    Write-Output "Executing ${fileName} function"\n}\n\n# Export the function\n${fileName}`,
		6: `# ${fileName} Device Inventory Script\n\n[CmdletBinding()]\nparam()\n\n# Return inventory data\n@{\n    Name = "${fileName}"\n    Value = "Sample inventory data"\n}`,
		12: `# ${fileName} Preflight Script\n\n[CmdletBinding()]\nparam()\n\n# Preflight check logic\n$result = $true\n\n# Return true if preflight check passes, false otherwise\nReturn $result`,
		13: `# ${fileName} Integration Script\n\n[CmdletBinding()]\nparam()\n\n# Integration logic\nWrite-Output "Executing ${fileName} integration script"`,
		3: `# ${fileName} Maintenance Task Script\n\n[CmdletBinding()]\nparam()\n\n# Task logic\nWrite-Output "Executing ${fileName} maintenance task"`
	};

	defaultContent += contentTemplates[selectedSubCategory.value as keyof typeof contentTemplates] 
		|| `# ${fileName} Script\n\n[CmdletBinding()]\nparam()\n\nWrite-Output "Hello from ${fileName} script"`;

	return defaultContent;
}

async function handleDeleteFile(
	state: ExtensionState,
	immyFs: ImmyBotFileSystemProvider,
	localRepoProvider: ImmyBotScriptTreeDataProvider,
	globalRepoProvider: ImmyBotScriptTreeDataProvider
) {
	if (!state.initialized) {
		vscode.window.showErrorMessage('Please sign in first.');
		return;
	}

	try {
		// Build a list of directories to scan with the new structure
		const rootFolders = ['My Scripts', 'Global Scripts'];
		const subFolders = [
			'Functions', 'Modules', 'Software', 'Task', 'Inventory',
			'Preflight', 'Integration', 'Deployment', 'System', 'Unknown'
		];

		const softwareSubFolders = [
			'Detection', 'Download', 'Dynamic Version', 'Action (Install|Uninstall|Upgrade)'
		];

		const deploymentSubFolders = ['Filter', 'Metascript'];

		const allFiles: { label: string; uri: vscode.Uri }[] = [];

		// Scan all directories for files
		for (const rootFolder of rootFolders) {
			for (const subFolder of subFolders) {
				try {
					if (subFolder === 'Software') {
						// Handle software subcategories
						for (const softwareSubFolder of softwareSubFolders) {
							const dirPath = `immyfs:/${rootFolder}/${subFolder}/${softwareSubFolder}`;
							const files = immyFs.readDirectory(vscode.Uri.parse(dirPath));
							for (const [fileName, fileType] of files) {
								if (fileType === vscode.FileType.File) {
									allFiles.push({
										label: `${rootFolder}/${subFolder}/${softwareSubFolder}/${fileName}`,
										uri: vscode.Uri.parse(`${dirPath}/${fileName}`)
									});
								}
							}
						}
					} else if (subFolder === 'Deployment') {
						// Handle deployment subcategories
						for (const deploymentSubFolder of deploymentSubFolders) {
							const dirPath = `immyfs:/${rootFolder}/${subFolder}/${deploymentSubFolder}`;
							const files = immyFs.readDirectory(vscode.Uri.parse(dirPath));
							for (const [fileName, fileType] of files) {
								if (fileType === vscode.FileType.File) {
									allFiles.push({
										label: `${rootFolder}/${subFolder}/${deploymentSubFolder}/${fileName}`,
										uri: vscode.Uri.parse(`${dirPath}/${fileName}`)
									});
								}
							}
						}
					} else {
						// Handle regular folders
						const dirPath = `immyfs:/${rootFolder}/${subFolder}`;
						const files = immyFs.readDirectory(vscode.Uri.parse(dirPath));
						for (const [fileName, fileType] of files) {
							if (fileType === vscode.FileType.File) {
								allFiles.push({
									label: `${rootFolder}/${subFolder}/${fileName}`,
									uri: vscode.Uri.parse(`${dirPath}/${fileName}`)
								});
							}
						}
					}
				} catch {
					// Directory might not exist, continue
				}
			}
		}

		if (allFiles.length === 0) {
			vscode.window.showInformationMessage('No files found to delete.');
			return;
		}

		// Show quick pick for file selection
		const selectedFile = await vscode.window.showQuickPick(
			allFiles.map(f => ({ label: f.label, uri: f.uri })),
			{ placeHolder: 'Select a file to delete' }
		);

		if (!selectedFile) {
			return; // User cancelled
		}

		// Confirm deletion
		const confirmResult = await vscode.window.showWarningMessage(
			`Are you sure you want to delete "${selectedFile.label}"?`,
			{ modal: true },
			'Delete'
		);

		if (confirmResult === 'Delete') {
			immyFs.delete(selectedFile.uri);
			vscode.window.showInformationMessage(`Deleted file: ${selectedFile.label}`);

			// Refresh the views
			localRepoProvider.refresh();
			globalRepoProvider.refresh();
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(`Failed to delete file: ${errorMessage}`);
		}
}

function registerMemfsCommands(context: vscode.ExtensionContext, state: ExtensionState, immyFs: ImmyBotFileSystemProvider) {
	context.subscriptions.push(vscode.commands.registerCommand('immyfs.reset', async () => {
		// This command should not be used - it's a legacy command that doesn't properly update state
		vscode.window.showWarningMessage('This command is deprecated. Please use the Sign In command instead.');
	}));

	context.subscriptions.push(vscode.commands.registerCommand('immyfs.addFile', () => {
		if (state.initialized) {
			immyFs.writeFile(vscode.Uri.parse(`immyfs:/file.txt`), Buffer.from('foo'), { create: true, overwrite: true });
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('immyfs.deleteFile', () => {
		if (state.initialized) {
			immyFs.delete(vscode.Uri.parse('immyfs:/file.txt'));
		}
	}));

	// Don't add workspace folder here - it will be added after successful authentication
}

// Function to add the workspace folder after authentication
export function addImmyBotWorkspaceFolder() {
	vscode.workspace.updateWorkspaceFolders(0, 0, { uri: vscode.Uri.parse('immyfs:/'), name: 'ImmyBot' });
}