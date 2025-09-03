# Azure AD App Registration Setup for ImmyBot VS Code Extension

This document explains how to configure Azure AD authentication for the ImmyBot VS Code extension to resolve the `AADSTS900971` error.

## The Problem

The `AADSTS900971: No reply address provided` error occurs when the Azure AD app registration used by the extension is missing the required redirect URIs for VS Code authentication.

## Solution Options

### Option 1: Configure Your Own Azure AD App Registration (Recommended)

1. **Create a new Azure AD App Registration:**
   - Go to the [Azure Portal](https://portal.azure.com)
   - Navigate to **Azure Active Directory** > **App registrations**
   - Click **New registration**

2. **Configure the app registration:**
   - **Name**: ImmyBot VS Code Extension (or your preferred name)
   - **Supported account types**: Choose based on your needs:
     - **Accounts in this organizational directory only** (single tenant)
     - **Accounts in any organizational directory** (multi-tenant)
   - **Redirect URI**: Leave blank for now, we'll add these next

3. **Add required redirect URIs:**
   - After creating the app, go to **Authentication**
   - Click **Add a platform** > **Web**
   - Add these redirect URIs:
     ```
     https://vscode.dev/redirect
     vscode://vscode.github-authentication/did-authenticate
     ```
   - Click **Configure**

4. **Configure API permissions:**
   - Go to **API permissions**
   - Click **Add a permission** > **Microsoft Graph** > **Delegated permissions**
   - Add these permissions:
     - `openid`
     - `profile`
     - `offline_access`
     - `Files.ReadWrite` (if needed for file operations)

5. **Copy the Client ID:**
   - Go to the **Overview** tab
   - Copy the **Application (client) ID**

6. **Configure the VS Code extension:**
   - Open VS Code settings (Ctrl/Cmd + ,)
   - Search for "immybot"
   - Set **ImmyBot: Azure Client Id** to your copied Client ID
   - Set **ImmyBot: Azure Tenant** to your tenant ID or "common" for multi-tenant

### Option 2: Request Configuration of the Default App Registration

If you prefer to use the default app registration, contact the extension maintainers to request that the following redirect URIs be added to the existing app registration (`f72a44d4-d2d4-450e-a2db-76b307cd045f`):

- `https://vscode.dev/redirect`
- `vscode://vscode.github-authentication/did-authenticate`

## Configuration Settings

The extension provides these configuration options in VS Code settings:

| Setting | Description | Default |
|---------|-------------|---------|
| `immybot.azureClientId` | Azure AD Application Client ID | `""` (uses default) |
| `immybot.azureTenant` | Azure AD Tenant ID or domain | `"common"` |

## Troubleshooting

### Common Errors

**AADSTS900971: No reply address provided**
- Cause: Missing redirect URIs in Azure AD app registration
- Solution: Add the required redirect URIs listed above

**AADSTS50020: User account from identity provider does not exist in tenant**
- Cause: Single-tenant app registration with wrong tenant configuration
- Solution: Either switch to multi-tenant or set the correct tenant ID in settings

**AADSTS700016: Application not found in the directory**
- Cause: Invalid Client ID
- Solution: Verify the Client ID is correct in your settings

### Getting Help

If you continue to experience authentication issues:

1. Check the **Microsoft Authentication** output channel in VS Code for detailed error information
2. Verify your Azure AD app registration configuration
3. Ensure your VS Code extension settings are correct
4. Contact your Azure AD administrator for assistance with app registration permissions

## Security Considerations

- Only grant the minimum required permissions to your Azure AD app registration
- Use single-tenant app registrations when possible for better security
- Regularly review and audit app registration permissions
- Consider using Conditional Access policies to control access to the app registration