/**
 * Script management for ImmyBot VS Code extension
 */
import * as vscode from 'vscode';
import { ImmyBotFileSystemProvider } from './immyBotFileSystemProvider';
import { ImmyBotClient } from './immyBotClient';
import { ScriptCategory } from './types';

export class ScriptManager {
	constructor(private immyFs: ImmyBotFileSystemProvider, private instanceUrl?: string) {}

	async fetchScripts() {
		const client = new ImmyBotClient(this.instanceUrl);
		const response = await client.fetchJson<any>('/api/v1/scripts');

		// Create top-level directories for Local and Global scripts
		this.immyFs.createDirectory(vscode.Uri.parse('immyfs:/My Scripts'));
		this.immyFs.createDirectory(vscode.Uri.parse('immyfs:/Global Scripts'));

		// Create .vscode directory and mcp.json to prevent VS Code errors
		this.immyFs.createDirectory(vscode.Uri.parse('immyfs:/.vscode'));
		this.immyFs.writeFile(vscode.Uri.parse('immyfs:/.vscode/mcp.json'), Buffer.from('{}'), { create: true, overwrite: true });

		// Create subdirectories under My Scripts
		this.createScriptDirectories('My Scripts');

		// Create subdirectories under Global Scripts
		this.createScriptDirectories('Global Scripts');

		vscode.window.showInformationMessage('Fetching scripts');
		if (response && Array.isArray(response)) {
			response.forEach((script: any) => {
				if (script && typeof script.scriptCategory !== 'undefined' && script.name && script.action) {
					this.processScript(script);
				}
			});
		} else {
			console.error('Failed to fetch scripts or invalid response format', response);
		}
	}

	private createScriptDirectories(rootFolder: string) {
		// Create main subdirectories
		const mainDirs = ['Modules', 'Functions', 'Software', 'Task', 'Inventory', 'Preflight', 'Integration', 'Deployment'];
		for (const dir of mainDirs) {
			this.immyFs.createDirectory(vscode.Uri.parse(`immyfs:/${rootFolder}/${dir}`));
		}

		// Create Software subcategories
		const softwareSubDirs = ['Detection', 'Download', 'Dynamic Version', 'Action (Install|Uninstall|Upgrade)'];
		for (const subDir of softwareSubDirs) {
			this.immyFs.createDirectory(vscode.Uri.parse(`immyfs:/${rootFolder}/Software/${subDir}`));
		}

		// Create Deployment subcategories
		const deploymentSubDirs = ['Filter', 'Metascript'];
		for (const subDir of deploymentSubDirs) {
			this.immyFs.createDirectory(vscode.Uri.parse(`immyfs:/${rootFolder}/Deployment/${subDir}`));
		}
	}

	private processScript(script: any) {
		const extension = script.scriptLanguage === 2 ? (script.scriptCategory === 11 ? '.psm1' : '.ps1') : '.cmd';
		let fileName = '';
		let folderPath = '';

		// Determine the root folder based on script type
		const rootFolder = script.scriptType === 1 ? 'My Scripts' : 'Global Scripts';

		// Map script category to the appropriate folder structure
		folderPath = this.getCategoryFolderPath(script.scriptCategory, rootFolder);
		fileName = `immyfs:/${folderPath}/${script.name}${extension}`;

		// Add metadata to the script content
		let scriptContent = script.action;

		// Only add metadata if it doesn't already exist and it's a PowerShell script
		if (script.scriptLanguage === 2 && !scriptContent.includes('<#\nMETADATA')) {
			scriptContent = this.addScriptMetadata(script, scriptContent);
		}

		try {
			this.immyFs.writeFile(vscode.Uri.parse(fileName), Buffer.from(scriptContent), { create: true, overwrite: true });
		} catch (e) {
			console.error(e);
		}
	}

	private getCategoryFolderPath(scriptCategory: number, rootFolder: string): string {
		switch (scriptCategory) {
			case 0: // SoftwareDetection
				return `${rootFolder}/Software/Detection`;
			case 1: // SoftwareAutoUpdate (deprecated)
				return `${rootFolder}/Software/Action (Install|Uninstall|Upgrade)`;
			case 2: // SoftwareVersionAction
				return `${rootFolder}/Software/Action (Install|Uninstall|Upgrade)`;
			case 3: // MaintenanceTaskSetter
				return `${rootFolder}/Task`;
			case 4: // MetascriptDeploymentTarget
				return `${rootFolder}/Deployment/Metascript`;
			case 5: // FilterScriptDeploymentTarget
				return `${rootFolder}/Deployment/Filter`;
			case 6: // DeviceInventory
				return `${rootFolder}/Inventory`;
			case 7: // Function
				return `${rootFolder}/Functions`;
			case 8: // ImmySystem
				return `${rootFolder}/System`;
			case 9: // DynamicVersions
				return `${rootFolder}/Software/Dynamic Version`;
			case 10: // DownloadInstaller
				return `${rootFolder}/Software/Download`;
			case 11: // Module
				return `${rootFolder}/Modules`;
			case 12: // Preflight
				return `${rootFolder}/Preflight`;
			case 13: // Integration
				return `${rootFolder}/Integration`;
			default:
				return `${rootFolder}/Unknown`;
		}
	}

	private addScriptMetadata(script: any, scriptContent: string): string {
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
		const metadata = `<#
METADATA
ScriptType: ${script.scriptType} (${scriptTypeName})
ScriptCategory: ${script.scriptCategory} (${scriptCategoryName})
ExecutionContext: ${script.scriptExecutionContext} (${executionContextName})
Language: ${script.scriptLanguage} (${languageName})
CreatedBy: ${script.updatedBy || 'Unknown'}
CreatedDate: ${script.createdDateUTC || new Date().toISOString()}
LastUpdated: ${script.updatedDateUTC || new Date().toISOString()}
#>

`;

		return metadata + scriptContent;
	}
}