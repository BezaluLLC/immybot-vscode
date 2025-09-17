/**
 * Tree view provider for ImmyBot script repositories
 */
import * as vscode from 'vscode';
import { ImmyBotTreeItem, ExtensionState } from './types';
import { ImmyBotFileSystemProvider } from './immyBotFileSystemProvider';

// TreeView provider for repositories
export class ImmyBotScriptTreeDataProvider implements vscode.TreeDataProvider<ImmyBotTreeItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<ImmyBotTreeItem | undefined | null | void> = new vscode.EventEmitter<ImmyBotTreeItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<ImmyBotTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

	constructor(
		private repoType: 'local' | 'global',
		private immyFs: ImmyBotFileSystemProvider,
		private getState: () => ExtensionState
	) { }

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
						dirPath = `immyfs:/${rootFolder}/${parentFolder}/${element.label}`;
					} else if (element.label === 'Filter' || element.label === 'Metascript') {
						parentFolder = 'Deployment';
						dirPath = `immyfs:/${rootFolder}/${parentFolder}/${element.label}`;
					} else {
						// Top-level category
						dirPath = `immyfs:/${rootFolder}/${element.label}`;
					}

					const uri = vscode.Uri.parse(dirPath);
					const files = this.immyFs.readDirectory(uri);
					const fileItems = [];

					for (const [fileName, fileType] of files) {
						if (fileType === vscode.FileType.File) {
							const fileItem = new ImmyBotTreeItem(
								fileName,
								vscode.TreeItemCollapsibleState.None,
								undefined,
								'file'
							);
							// Make file items clickable
							fileItem.command = {
								command: 'vscode.open',
								title: 'Open File',
								arguments: [vscode.Uri.parse(`${dirPath}/${fileName}`)]
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
					return Promise.resolve([]);
				}
			}
			return Promise.resolve(element.children || []);
		} else {
			const state = this.getState();
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
					], undefined, `Signed in as ${state.firstName}`)
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
					], undefined, `Signed in as ${state.firstName}`)
				]);
			}
		}
	}
}