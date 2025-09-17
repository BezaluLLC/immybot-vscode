/**
 * Authentication handling for the ImmyBot VS Code extension
 */
import * as vscode from 'vscode';
import { SCOPES, ExtensionState } from './types';
import { addImmyBotWorkspaceFolder } from './commands';

// Add helper function to parse JWT
export function parseJwt(token: string) {
	try {
		// Base64 decoding
		const base64Url = token.split('.')[1];
		const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
		const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
			return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
		}).join(''));

		return JSON.parse(jsonPayload);
	} catch (e) {
		return { error: 'Unable to parse token', message: e instanceof Error ? e.message : String(e) };
	}
}

// Helper function to handle sign-in attempts
export async function attemptSignIn(
	promptForAuth: boolean,
	state: ExtensionState,
	updateState: (updates: Partial<ExtensionState>) => void,
	onSuccessfulSignIn: () => Promise<void>
): Promise<boolean> {
	console.log('attemptSignIn called with promptForAuth:', promptForAuth);
	
	// Check if authentication API is available
	if (!vscode.authentication) {
		console.error('VSCode authentication API not available');
		vscode.window.showErrorMessage('Authentication API not available in this context');
		return false;
	}
	
	try {
		// Check for the force new session flag
		const forceNewSession = state.extensionContext?.globalState.get('immybot.forceNewSession', false);

		// If we're explicitly signing in and a new session is forced, use forceNewSession
		if (promptForAuth && forceNewSession) {
			// Clear the flag so we don't force new sessions forever
			await state.extensionContext?.globalState.update('immybot.forceNewSession', false);

			// Force a completely new authentication
			const session = await vscode.authentication.getSession('microsoft', SCOPES, {
				forceNewSession: true
			});

			if (session) {
				updateState({ session });
				await processSuccessfulSignIn(state, updateState, onSuccessfulSignIn);
				return true;
			}
			return false;
		}

		// Check for existing session first
		let existingSession: vscode.AuthenticationSession | undefined;

		try {
			// Try to get an existing session without creating a new one
			// Use createIfNone=false to ensure we don't auto-create a session
			existingSession = await vscode.authentication.getSession('microsoft', SCOPES, {
				createIfNone: false,
				silent: !promptForAuth // Only show UI if explicitly requested
			});
		} catch (e) {
			// Ignore errors when silently checking for a session
			if (promptForAuth) {
				throw e; // Re-throw if we were explicitly trying to authenticate
			}
		}

		if (existingSession) {
			// We have an existing valid session
			updateState({ session: existingSession });
			await processSuccessfulSignIn(state, updateState, onSuccessfulSignIn);
			return true;
		} else if (promptForAuth) {
			// No existing session but user clicked sign-in button, so prompt for auth
			const session = await vscode.authentication.getSession('microsoft', SCOPES, {
				createIfNone: true
			});

			if (session) {
				updateState({ session });
				await processSuccessfulSignIn(state, updateState, onSuccessfulSignIn);
				return true;
			}
		} else {
			// No session and not prompting for auth - just show the sign-in view
			await vscode.commands.executeCommand('setContext', 'immybot:authenticated', false);
		}

		return false;
	} catch (error) {
		vscode.window.showErrorMessage(`Authentication error: ${error instanceof Error ? error.message : String(error)}`);
		console.error("Authentication error:", error);
		return false;
	}
}

// Process a successful sign-in - extract user info and set up views
export async function processSuccessfulSignIn(
	state: ExtensionState,
	updateState: (updates: Partial<ExtensionState>) => void,
	onSuccessfulSignIn: () => Promise<void>
) {
	if (!state.session || !state.session.accessToken) {
		return false;
	}

	vscode.window.showInformationMessage('Signed in as ' + state.session.account.label);

	// Use the output channel created during activation
	state.authOutputChannel?.appendLine(`Successfully signed in to Microsoft Authentication`);
	state.authOutputChannel?.appendLine(`Account ID: ${state.session.account.id}`);
	state.authOutputChannel?.appendLine(`Account Label: ${state.session.account.label}`);
	state.authOutputChannel?.appendLine(`Session ID: ${state.session.id}`);
	state.authOutputChannel?.appendLine(`Session Scopes: ${state.session.scopes.join(', ')}`);

	// Parse and log id token if available
	if ('idToken' in state.session) {
		const idToken = (state.session as any).idToken;
		if (idToken) {
			const tokenData = parseJwt(idToken);
			state.authOutputChannel?.appendLine(`\nID Token Contents:`);

			// Log useful claims
			const claimsToDisplay = [
				'name', 'preferred_username', 'email', 'oid', 'tid',
				'given_name', 'family_name', 'upn', 'unique_name', 'sub'
			];

			for (const claim of claimsToDisplay) {
				if (claim in tokenData) {
					state.authOutputChannel?.appendLine(`  - ${claim}: ${tokenData[claim]}`);
				}
			}

			// Get first name from name claim
			if (tokenData.name) {
				const firstName = tokenData.name.split(' ')[0]; // Get first part of the name
				updateState({ firstName });
			}
		}
	}

	state.authOutputChannel?.show();

	// Set context to update sidebar visibility
	await vscode.commands.executeCommand('setContext', 'immybot:authenticated', true);

	// Update editor context
	updateEditorContext();

	// If not initialized, load scripts and add workspace folder
	if (!state.initialized) {
		await onSuccessfulSignIn();
		updateState({ initialized: true });
		
		// Add the workspace folder after successful authentication
		addImmyBotWorkspaceFolder();
	}

	return true;
}

// Helper function to update context for editor-dependent buttons
export function updateEditorContext() {
	const isEditorOpen = vscode.window.activeTextEditor !== undefined;
	vscode.commands.executeCommand('setContext', 'editorIsOpen', isEditorOpen);
}