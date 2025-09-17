/**
 * Development configuration handling for local testing
 * This file handles loading and saving development settings from .vscode/development.json
 */
import * as vscode from 'vscode';
import * as path from 'path';

export interface DevelopmentConfig {
	'immybot.autoSignIn'?: boolean;
	'immybot.instanceUrl'?: string;
	'immybot.accessToken'?: string;
	'immybot.microsoftToken'?: string;
	'immybot.tokenExpiry'?: string;
	'immybot.debugMode'?: boolean;
}

const DEV_CONFIG_PATH = '.vscode/development.json';

export async function loadDevelopmentConfig(): Promise<DevelopmentConfig> {
	try {
		// Try to read the development config file
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return {};
		}

		const configPath = path.join(workspaceFolders[0].uri.fsPath, DEV_CONFIG_PATH);
		const configUri = vscode.Uri.file(configPath);
		
		const configData = await vscode.workspace.fs.readFile(configUri);
		const configText = Buffer.from(configData).toString('utf8');
		
		return JSON.parse(configText) as DevelopmentConfig;
	} catch (error) {
		// File doesn't exist or can't be read - return empty config
		return {};
	}
}

export async function saveDevelopmentConfig(config: DevelopmentConfig): Promise<void> {
	try {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (!workspaceFolders || workspaceFolders.length === 0) {
			return;
		}

		const configPath = path.join(workspaceFolders[0].uri.fsPath, DEV_CONFIG_PATH);
		const configUri = vscode.Uri.file(configPath);
		
		const configText = JSON.stringify(config, null, 2);
		const configData = Buffer.from(configText, 'utf8');
		
		await vscode.workspace.fs.writeFile(configUri, configData);
		} catch (error) {
		}
}

export async function updateDevelopmentConfig(updates: Partial<DevelopmentConfig>): Promise<void> {
	const currentConfig = await loadDevelopmentConfig();
	const newConfig = { ...currentConfig, ...updates };
	await saveDevelopmentConfig(newConfig);
}

export function isDevelopmentMode(): boolean {
	// Check if we're in development mode (extension development host)
	return vscode.env.appName.includes('Extension Development Host') || 
		   vscode.env.appName.includes('Code - OSS');
}