/**
 * Authentication handling for the ImmyBot VS Code extension
 */
import * as vscode from 'vscode';
import { SCOPES, ExtensionState } from './types';
import { addImmyBotWorkspaceFolder } from './commands';
import { isDevelopmentMode, updateDevelopmentConfig } from './developmentConfig';

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
	state.authOutputChannel?.appendLine(`attemptSignIn called with promptForAuth: ${promptForAuth}`);
	
	// Check if authentication API is available
	if (!vscode.authentication) {
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

		if (promptForAuth) {
			// User explicitly clicked sign-in button, so prompt for auth immediately
			state.authOutputChannel?.appendLine('User requested sign-in, prompting for Microsoft authentication...');
			state.authOutputChannel?.appendLine('User requested sign-in, prompting for Microsoft authentication...');
			
			const session = await vscode.authentication.getSession('microsoft', SCOPES, {
				createIfNone: true
			});

			if (session) {
				state.authOutputChannel?.appendLine(`Successfully obtained Microsoft session: ${session.account.label}`);
				
				// Update state with session and create updated state object for processSuccessfulSignIn
				updateState({ session });
				const updatedState = { ...state, session };
				
				try {
					state.authOutputChannel?.appendLine('About to call processSuccessfulSignIn...');
					state.authOutputChannel?.appendLine('About to call processSuccessfulSignIn...');
					
					const processResult = await processSuccessfulSignIn(updatedState, updateState, onSuccessfulSignIn);
					
					state.authOutputChannel?.appendLine(`processSuccessfulSignIn result: ${processResult}`);
					
					return processResult;
				} catch (error) {
					state.authOutputChannel?.appendLine(`Error in processSuccessfulSignIn: ${error instanceof Error ? error.message : String(error)}`);
					state.authOutputChannel?.appendLine(`Error stack: ${error instanceof Error ? error.stack : 'No stack available'}`);
					vscode.window.showErrorMessage(`Authentication processing failed: ${error instanceof Error ? error.message : String(error)}`);
					return false;
				}
			} else {
				state.authOutputChannel?.appendLine('Failed to obtain Microsoft session');
				state.authOutputChannel?.appendLine('Failed to obtain Microsoft session');
				vscode.window.showErrorMessage('Failed to authenticate with Microsoft');
				return false;
			}
		}

		// Check for existing session first (only for silent authentication)
		let existingSession: vscode.AuthenticationSession | undefined;

		try {
			// Try to get an existing session without creating a new one
			// Use createIfNone=false to ensure we don't auto-create a session
			state.authOutputChannel?.appendLine('Checking for existing Microsoft session (silent)...');
			state.authOutputChannel?.appendLine('Checking for existing Microsoft session (silent)...');
			
			existingSession = await vscode.authentication.getSession('microsoft', SCOPES, {
				createIfNone: false,
				silent: true // Always silent for startup checks
			});
			
			if (existingSession) {
				state.authOutputChannel?.appendLine(`Found existing Microsoft session: ${existingSession.account.label}`);
			} else {
				state.authOutputChannel?.appendLine('No existing Microsoft session found');
			}
		} catch (e) {
			state.authOutputChannel?.appendLine(`Error checking for existing session: ${e instanceof Error ? e.message : String(e)}`);
		}

		if (existingSession) {
			// We have an existing valid session
			state.authOutputChannel?.appendLine('Using existing session for authentication');
			state.authOutputChannel?.appendLine('Using existing session for authentication');
			updateState({ session: existingSession });
			
			// Create updated state object with the session for processSuccessfulSignIn
			const updatedState = { ...state, session: existingSession };
			await processSuccessfulSignIn(updatedState, updateState, onSuccessfulSignIn);
			return true;
		} else {
			// No session and not prompting for auth - just show the sign-in view
			state.authOutputChannel?.appendLine('No session found, showing sign-in view');
			state.authOutputChannel?.appendLine('No session found, showing sign-in view');
			await vscode.commands.executeCommand('setContext', 'immybot:authenticated', false);
		}

		state.authOutputChannel?.appendLine('Authentication attempt completed, result: false');
		state.authOutputChannel?.appendLine('Authentication attempt completed, result: false');
		return false;
	} catch (error) {
		vscode.window.showErrorMessage(`Authentication error: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
}

// Process a successful sign-in - extract user info and set up views
export async function processSuccessfulSignIn(
	state: ExtensionState,
	updateState: (updates: Partial<ExtensionState>) => void,
	onSuccessfulSignIn: () => Promise<void>
) {
	state.authOutputChannel?.appendLine('=== ENTERING processSuccessfulSignIn ===');
	state.authOutputChannel?.appendLine('=== ENTERING processSuccessfulSignIn ===');
	
	if (!state.session || !state.session.accessToken) {
		state.authOutputChannel?.appendLine('ERROR: No session or access token available');
		state.authOutputChannel?.appendLine('ERROR: No session or access token available');
		return false;
	}

	state.authOutputChannel?.appendLine('Session validation passed, proceeding with sign-in processing');
	state.authOutputChannel?.appendLine('Session validation passed, proceeding with sign-in processing');

	vscode.window.showInformationMessage('Signed in as ' + state.session.account.label);

	// Use the output channel created during activation
	state.authOutputChannel?.appendLine(`Successfully signed in to Microsoft Authentication`);
	state.authOutputChannel?.appendLine(`Account ID: ${state.session.account.id}`);
	state.authOutputChannel?.appendLine(`Account Label: ${state.session.account.label}`);
	state.authOutputChannel?.appendLine(`Session ID: ${state.session.id}`);
	state.authOutputChannel?.appendLine(`Session Scopes: ${state.session.scopes.join(', ')}`);

	// Parse and log id token if available
	if ('idToken' in state.session) {
		const idToken = (state.session as { idToken?: string }).idToken;
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

	// Now exchange the Microsoft token for an ImmyBot token
	state.authOutputChannel?.appendLine('Checking instance URL for token exchange...');
	state.authOutputChannel?.appendLine('Checking instance URL for token exchange...');
	
	if (state.instanceUrl) {
		try {
			state.authOutputChannel?.appendLine('Starting token exchange process...');
			state.authOutputChannel?.appendLine(`\nExchanging Microsoft token for ImmyBot access token...`);
			state.authOutputChannel?.appendLine(`Using instance URL: ${state.instanceUrl}`);
			
			const immyBotToken = await exchangeTokenForImmyBot(state.session.accessToken, state.instanceUrl, state);
			
			state.authOutputChannel?.appendLine(`Token exchange completed, result: ${immyBotToken ? 'SUCCESS' : 'FAILED'}`);
			
			if (immyBotToken) {
				state.authOutputChannel?.appendLine('Updating state with ImmyBot access token...');
				updateState({ immyBotAccessToken: immyBotToken.access_token });
				state.authOutputChannel?.appendLine(`Successfully obtained ImmyBot access token`);
				state.authOutputChannel?.appendLine(`Token expires in: ${immyBotToken.expires_in} seconds`);
				state.authOutputChannel?.appendLine('Successfully obtained ImmyBot access token');
				
				// Save tokens to development config if in development mode
				state.authOutputChannel?.appendLine('Checking if development mode for token saving...');
				if (isDevelopmentMode()) {
					state.authOutputChannel?.appendLine('Development mode detected, saving tokens...');
					const expiryTime = new Date(Date.now() + (immyBotToken.expires_in * 1000)).toISOString();
					await updateDevelopmentConfig({
						'immybot.accessToken': immyBotToken.access_token,
						'immybot.microsoftToken': state.session.accessToken,
						'immybot.tokenExpiry': expiryTime,
						'immybot.instanceUrl': state.instanceUrl,
						'immybot.autoSignIn': true
					});
					
					state.authOutputChannel?.appendLine('Development tokens saved to .vscode/development.json');
					state.authOutputChannel?.appendLine('Development tokens saved to .vscode/development.json');
					state.authOutputChannel?.appendLine(`Token expires at: ${expiryTime}`);
				} else {
					state.authOutputChannel?.appendLine('Not in development mode, skipping token save');
				}
			} else {
				state.authOutputChannel?.appendLine('ERROR: Token exchange returned null/undefined');
				throw new Error('Failed to obtain ImmyBot access token');
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			state.authOutputChannel?.appendLine(`Failed to exchange token for ImmyBot: ${errorMessage}`);
			state.authOutputChannel?.appendLine(`Error stack: ${error instanceof Error ? error.stack : 'No stack available'}`);
			vscode.window.showErrorMessage(`Authentication with ImmyBot failed: ${errorMessage}`);
			return false;
		}
	} else {
		const errorMessage = 'No ImmyBot instance URL configured. Please set immybot.instanceUrl in settings.';
		state.authOutputChannel?.appendLine(`ERROR: ${errorMessage}`);
		vscode.window.showErrorMessage(errorMessage);
		return false;
	}

	state.authOutputChannel?.appendLine('Showing auth output channel...');
	state.authOutputChannel?.show();

	state.authOutputChannel?.appendLine('Setting authentication context...');
	// Set context to update sidebar visibility
	await vscode.commands.executeCommand('setContext', 'immybot:authenticated', true);

	state.authOutputChannel?.appendLine('Updating editor context...');
	// Update editor context
	updateEditorContext();

	state.authOutputChannel?.appendLine('Checking initialization state...');
	// If not initialized, load scripts and add workspace folder
	if (!state.initialized) {
		state.authOutputChannel?.appendLine('Not initialized, calling onSuccessfulSignIn callback...');
		state.authOutputChannel?.appendLine('Calling onSuccessfulSignIn callback to load scripts...');
		
		try {
			await onSuccessfulSignIn();
			state.authOutputChannel?.appendLine('onSuccessfulSignIn callback completed successfully');
			state.authOutputChannel?.appendLine('onSuccessfulSignIn callback completed successfully');
			
			updateState({ initialized: true });
			state.authOutputChannel?.appendLine('State updated with initialized: true');
			
			// Add the workspace folder after successful authentication
			state.authOutputChannel?.appendLine('Adding ImmyBot workspace folder...');
			addImmyBotWorkspaceFolder();
		} catch (error) {
			state.authOutputChannel?.appendLine(`Error in onSuccessfulSignIn callback: ${error instanceof Error ? error.message : String(error)}`);
			state.authOutputChannel?.appendLine(`Error stack: ${error instanceof Error ? error.stack : 'No stack available'}`);
			throw error; // Re-throw to be caught by outer try-catch
		}
	} else {
		state.authOutputChannel?.appendLine('Already initialized, skipping onSuccessfulSignIn callback');
		state.authOutputChannel?.appendLine('Already initialized, skipping onSuccessfulSignIn callback');
	}

	state.authOutputChannel?.appendLine('=== EXITING processSuccessfulSignIn with SUCCESS ===');
	state.authOutputChannel?.appendLine('=== EXITING processSuccessfulSignIn with SUCCESS ===');
	return true;
}

// Exchange Microsoft OAuth token for ImmyBot access token
export async function exchangeTokenForImmyBot(microsoftToken: string, instanceUrl: string, state?: ExtensionState): Promise<{ access_token: string; expires_in: number } | null> {
	try {
		// Parse the Microsoft token to get tenant information
		const tokenData = parseJwt(microsoftToken);
		if (tokenData.error) {
			throw new Error(`Failed to parse Microsoft token: ${tokenData.message}`);
		}

		const tenantId = tokenData.tid;
		if (!tenantId) {
			throw new Error('No tenant ID found in Microsoft token');
		}

		// Use the same client ID as defined in types.ts
		const clientId = '1c8f6b7f-8397-48f4-9880-75460ab61bab';
		
		// Construct the token endpoint
		const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
		
		// Prepare the request body for on-behalf-of flow
		const body = new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			client_id: clientId,
			assertion: microsoftToken,
			scope: `${instanceUrl}/.default`,
			requested_token_use: 'on_behalf_of'
		});

		state?.authOutputChannel?.appendLine(`Exchanging token with ImmyBot instance: ${instanceUrl}`);
		state?.authOutputChannel?.appendLine(`Using tenant ID: ${tenantId}`);
		state?.authOutputChannel?.appendLine(`Token endpoint URL: ${tokenEndpoint}`);
		state?.authOutputChannel?.appendLine(`Request body length: ${body.toString().length}`);

		try {
			state?.authOutputChannel?.appendLine(`Making fetch request to: ${tokenEndpoint}`);
			const response = await fetch(tokenEndpoint, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: body.toString()
			});

			state?.authOutputChannel?.appendLine(`Fetch completed successfully, response status: ${response.status}`);
			state?.authOutputChannel?.appendLine(`Response headers available: ${response.headers ? 'YES' : 'NO'}`);

			if (!response.ok) {
				const errorText = await response.text();
				state?.authOutputChannel?.appendLine(`HTTP error response: ${errorText}`);
				throw new Error(`Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`);
			}

			state?.authOutputChannel?.appendLine('Token response parsed successfully');
			const tokenResponse = await response.json();
			return {
				access_token: tokenResponse.access_token,
				expires_in: tokenResponse.expires_in || 3600
			};
		} catch (fetchError) {
			state?.authOutputChannel?.appendLine('=== FETCH ERROR DETAILS ===');
			state?.authOutputChannel?.appendLine(`Error type: ${typeof fetchError}`);
			state?.authOutputChannel?.appendLine(`Error constructor: ${fetchError?.constructor?.name}`);
			state?.authOutputChannel?.appendLine(`Error name: ${fetchError instanceof Error ? fetchError.name : 'Unknown'}`);
			state?.authOutputChannel?.appendLine(`Error message: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
			state?.authOutputChannel?.appendLine(`Error stack: ${fetchError instanceof Error ? fetchError.stack : 'No stack available'}`);
			state?.authOutputChannel?.appendLine(`Is TypeError: ${fetchError instanceof TypeError}`);
			state?.authOutputChannel?.appendLine(`Is NetworkError: ${fetchError && typeof fetchError === 'object' && 'name' in fetchError && (fetchError as Error).name === 'NetworkError'}`);
			state?.authOutputChannel?.appendLine(`Error toString(): ${String(fetchError)}`);
			throw fetchError;
		}
	} catch (error) {
		state?.authOutputChannel?.appendLine('=== EXITING exchangeTokenForImmyBot with ERROR ===');
		state?.authOutputChannel?.appendLine(`Token exchange error: ${error instanceof Error ? error.message : String(error)}`);
		state?.authOutputChannel?.appendLine(`Error stack: ${error instanceof Error ? error.stack : 'No stack available'}`);
		return null;
	}
}

// Helper function to update context for editor-dependent buttons
export function updateEditorContext() {
	const isEditorOpen = vscode.window.activeTextEditor !== undefined;
	vscode.commands.executeCommand('setContext', 'editorIsOpen', isEditorOpen);
}