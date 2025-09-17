#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Clean debug script for ImmyBot extension with isolated logs
.DESCRIPTION
    Uses --user-data-dir to create fresh logs, runs for 15 seconds, then analyzes
#>

param(
    [int]$TimeoutSeconds = 120
)
$ProgressPreference = 'SilentlyContinue'
$WorkspaceFolder = (Get-Location).Path
Write-Host "🔧 Starting ImmyBot Extension Debug (Clean Logs)" -ForegroundColor Cyan

# Step 1: Build extension
Write-Host "🔨 Building extension..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue
}

$buildResult = npm run compile-web
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    Write-Host "$buildResult" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Extension built" -ForegroundColor Green

# Step 2: Create isolated environment in temp directory
$TempBase = [System.IO.Path]::GetTempPath()
if (-not (Test-Path $TempBase)) {
    New-Item -ItemType Directory -Path $TempBase -Force | Out-Null
}
# Ensure git safe directory
$SessionId = [System.Guid]::NewGuid().ToString("N").Substring(0, 8)
$TestWorkspaceDir = Join-Path $TempBase "immybot-vscode-test-$SessionId" "workspace"
$UserDataDir = Join-Path $TempBase "immybot-vscode-test-$SessionId" "userdata"
# git config --global --add safe.directory $TempBase

Write-Host "📁 Using temp directories:" -ForegroundColor Gray
Write-Host "   Workspace: $TestWorkspaceDir" -ForegroundColor Gray
Write-Host "   UserData: $UserDataDir" -ForegroundColor Gray

# Clean previous runs and create new directories
@($TestWorkspaceDir, $UserDataDir) | ForEach-Object {
    if (Test-Path $_) {
        Remove-Item -Recurse -Force $_ -ErrorAction SilentlyContinue | Out-Null
    }
    New-Item -ItemType Directory -Path $_ -Force | Out-Null
}

# Handle configuration files
$WorkspaceConfigSource = Join-Path $WorkspaceFolder ".vscode" "settings.workspace.json"
$UserConfigSource = Join-Path $WorkspaceFolder ".vscode" "settings.user.json"

# Copy workspace settings if they exist
if (Test-Path $WorkspaceConfigSource) {
    $TestVSCodeDir = Join-Path $TestWorkspaceDir ".vscode"
    New-Item -ItemType Directory -Path $TestVSCodeDir -Force | Out-Null
    
    $WorkspaceConfigDest = Join-Path $TestVSCodeDir "settings.json"
    Copy-Item $WorkspaceConfigSource $WorkspaceConfigDest -Force
    
    Write-Host "📋 Copied workspace config to test workspace" -ForegroundColor Green
    
    # Show what was copied
    $ConfigContent = Get-Content $WorkspaceConfigSource | ConvertFrom-Json
    Write-Host "   📄 Workspace config contains:" -ForegroundColor Gray
    $ConfigContent.PSObject.Properties | ForEach-Object {
        $Value = if ($_.Name -match "token|Token") { "***REDACTED***" } else { $_.Value }
        Write-Host "      $($_.Name): $Value" -ForegroundColor Gray
    }
} else {
    Write-Host "⚠️  No workspace config found at $WorkspaceConfigSource" -ForegroundColor Yellow
}

# Handle user settings with workspace trust configuration
if (Test-Path $UserConfigSource) {
    # Read existing user config
    $UserConfigContent = Get-Content $UserConfigSource | ConvertFrom-Json
    Write-Host "📋 Found user config, merging with workspace trust settings" -ForegroundColor Green
} else {
    # Create new user config object
    $UserConfigContent = [PSCustomObject]@{}
    Write-Host "📋 Creating new user config with workspace trust settings" -ForegroundColor Green
}

# Add comprehensive workspace trust settings
$UserConfigContent | Add-Member -MemberType NoteProperty -Name "security.workspace.trust.untrustedFiles" -Value "open" -Force
$UserConfigContent | Add-Member -MemberType NoteProperty -Name "security.workspace.trust.banner" -Value "never" -Force
$UserConfigContent | Add-Member -MemberType NoteProperty -Name "security.workspace.trust.enabled" -Value $false -Force
$UserConfigContent | Add-Member -MemberType NoteProperty -Name "security.workspace.trust.startupPrompt" -Value "never" -Force
$UserConfigContent | Add-Member -MemberType NoteProperty -Name "security.workspace.trust.emptyWindow" -Value $false -Force

# Copy user settings to the User directory under userdata
$UserSettingsDir = Join-Path $UserDataDir "User"
New-Item -ItemType Directory -Path $UserSettingsDir -Force | Out-Null

$UserSettingsDest = Join-Path $UserSettingsDir "settings.json"
$UserConfigContent | ConvertTo-Json -Depth 10 | Set-Content $UserSettingsDest -Force

# Create workspace trust database to pre-trust the workspace
$WorkspaceTrustDir = Join-Path $UserDataDir "User" "workspaceStorage"
New-Item -ItemType Directory -Path $WorkspaceTrustDir -Force | Out-Null

# Create a trusted workspaces database
$TrustedWorkspaces = @{
    version = 1
    folders = @(
        @{
            uri = "file://$TestWorkspaceDir"
            trusted = $true
        }
    )
}

$WorkspaceTrustFile = Join-Path $UserSettingsDir "trusted-workspaces.json"
$TrustedWorkspaces | ConvertTo-Json -Depth 10 | Set-Content $WorkspaceTrustFile -Force

# Also add the workspace to argv.json to mark it as trusted
$ArgvContent = @{
    "enable-crash-reporter" = $true
    "crash-reporter-id" = [System.Guid]::NewGuid().ToString()
    "trusted-workspace" = $TestWorkspaceDir
}

$ArgvFile = Join-Path $UserDataDir "argv.json"
$ArgvContent | ConvertTo-Json -Depth 10 | Set-Content $ArgvFile -Force

Write-Host "📋 Created user settings with comprehensive workspace trust configuration" -ForegroundColor Green
Write-Host "   📄 User settings contains:" -ForegroundColor Gray
$UserConfigContent.PSObject.Properties | ForEach-Object {
    $Value = if ($_.Name -match "token|Token") { "***REDACTED***" } else { $_.Value }
    Write-Host "      $($_.Name): $Value" -ForegroundColor Gray
}
Write-Host "   📄 Created trusted workspaces database" -ForegroundColor Gray
Write-Host "   📄 Created argv.json with trusted workspace" -ForegroundColor Gray

# Check if we have authentication config
$HasAuthConfig = $false
if (Test-Path $WorkspaceConfigSource) {
    $WorkspaceConfig = Get-Content $WorkspaceConfigSource | ConvertFrom-Json
    if ($WorkspaceConfig.PSObject.Properties.Name -contains "immybot.accessToken") {
        $HasAuthConfig = $true
    }
}
if (Test-Path $UserConfigSource) {
    $UserConfig = Get-Content $UserConfigSource | ConvertFrom-Json
    if ($UserConfig.PSObject.Properties.Name -contains "immybot.accessToken") {
        $HasAuthConfig = $true
    }
}

if (-not $HasAuthConfig) {
    Write-Host "⚠️  No authentication config found in workspace or user settings" -ForegroundColor Yellow
    throw "Authentication config is required for testing"
}

$LogDir = Join-Path $UserDataDir "logs"

# Step 3: Launch VSCode with isolated user data
Write-Host "🚀 Launching VSCode with fresh logs..." -ForegroundColor Yellow
$VSCodeArgs = @(
    "--extensionDevelopmentPath=$WorkspaceFolder"
    "--extensionDevelopmentKind=web"
    "--disable-extensions"
    "--folder-uri=$TestWorkspaceDir"
    "--user-data-dir=$UserDataDir"
    "--trust-workspace"
    # "--wait"
    # "--new-window"
)
$BeforeProcessList = Get-Process -Name Electron -ErrorAction SilentlyContinue
code $VSCodeArgs
Start-Sleep -s 1
$AfterProcessList = Get-Process -Name Electron -ErrorAction SilentlyContinue
$CompareResult = Compare-Object $BeforeProcessList $AfterProcessList -Property Id -PassThru
$NewProcess = $CompareResult | Where-Object { $_.SideIndicator -eq "=>" }
if ($NewProcess) {
    $Process = $NewProcess | Select-Object -First 1
} else {
    throw "Failed to start VS Code process"
}
Write-Host "✅ VSCode launched (PID: $($Process.Id))" -ForegroundColor Green

# Step 4: Monitor VS Code process
Write-Host "⏱️  Monitoring VS Code process (timeout: $TimeoutSeconds seconds)..." -ForegroundColor Yellow
$StartTime = Get-Date
$ProcessExited = $false

while (((Get-Date) - $StartTime).TotalSeconds -lt $TimeoutSeconds) {
    try {
        # Check if the main process is still running
        $ProcessStillRunning = Get-Process -Id $Process.Id -ErrorAction SilentlyContinue
        
        if (-not $ProcessStillRunning) {
            Write-Host "✅ VS Code process exited naturally" -ForegroundColor Green
            $ProcessExited = $true
            break
        }
        
        # Also check for any VS Code processes that might have been spawned
        $VSCodeProcesses = Get-Process | Where-Object {
            $_.ProcessName -match "Code|Electron" -and
            $_.StartTime -gt $StartTime.AddSeconds(-5)
        }
        
        if (-not $VSCodeProcesses) {
            Write-Host "✅ All VS Code processes have exited" -ForegroundColor Green
            $ProcessExited = $true
            break
        }
        
        Start-Sleep -Seconds 1
    } catch {
        # Process might have exited between checks
        Write-Host "✅ VS Code process no longer accessible (likely exited)" -ForegroundColor Green
        $ProcessExited = $true
        break
    }
}

if (-not $ProcessExited) {
    Write-Host "⏰ Timeout reached after $TimeoutSeconds seconds" -ForegroundColor Yellow
}

# Step 5: Analyze logs BEFORE killing
Write-Host "📋 Analyzing fresh logs..." -ForegroundColor Yellow

if (Test-Path $LogDir) {
    $LatestLogDir = Get-ChildItem -Path $LogDir -Directory |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if ($LatestLogDir) {
        Write-Host "📁 Log directory: $($LatestLogDir.Name)" -ForegroundColor Green
        Write-Host "📁 Full log path: $($LatestLogDir.FullName)" -ForegroundColor Gray
        Write-Host "📅 Log timestamp: $($LatestLogDir.LastWriteTime)" -ForegroundColor Gray
        
        # Get all log files with detailed info
        $LogFiles = @()
        $LogFiles += Get-ChildItem -Path $LatestLogDir.FullName -Filter "*.log" -Recurse
        
        Write-Host "`n📊 Found $($LogFiles.Count) log files:" -ForegroundColor Yellow
        foreach ($LogFile in $LogFiles) {
            $FileSize = [math]::Round($LogFile.Length / 1KB, 2)
            Write-Host "   - $($LogFile.Name) ($FileSize KB, modified: $($LogFile.LastWriteTime.ToString('HH:mm:ss')))" -ForegroundColor Gray
        }
        
        $FoundActivity = $false
        foreach ($LogFile in $LogFiles) {
            # Get ALL content first, then filter for display
            $AllContent = Get-Content $LogFile.FullName -ErrorAction SilentlyContinue
            $FilteredContent = $AllContent | Where-Object {
                $_ -match "immybot|immyfs|Sign In|authentication|ExtensionService.*ImmyBot|ImmyBot Extension|Auto sign-in|Fetching scripts|Configuration loaded|attemptSignIn|exchangeTokenForImmyBot|Microsoft|token|API|scripts|error|Error|ERROR" -and
                $_ -notmatch "Skipping acquiring lock|Loading development extension"
            }
            
            if ($FilteredContent -or ($LogFile.Name -match "ImmyBot")) {
                $FoundActivity = $true
                Write-Host "`n📄 $(Split-Path $LogFile.FullName -Leaf) (showing last 20 relevant lines):" -ForegroundColor Cyan
                
                # Show last 20 relevant lines or all if fewer
                $LinesToShow = if ($FilteredContent.Count -gt 20) {
                    $FilteredContent | Select-Object -Last 20
                } else {
                    $FilteredContent
                }
                
                if ($LinesToShow) {
                    $LinesToShow | ForEach-Object {
                        $Color = if ($_ -match "error|Error|ERROR|failed|Failed|FAILED") {
                            "Red"
                        } elseif ($_ -match "success|Success|SUCCESS|completed|Completed") {
                            "Green"
                        } elseif ($_ -match "warning|Warning|WARNING") {
                            "Yellow"
                        } else {
                            "White"
                        }
                        Write-Host "   $_" -ForegroundColor $Color
                    }
                } else {
                    # If no filtered content but it's an ImmyBot log, show last 10 lines
                    if ($LogFile.Name -match "ImmyBot" -and $AllContent) {
                        Write-Host "   (No filtered content, showing last 10 lines of ImmyBot log)" -ForegroundColor Gray
                        $AllContent | Select-Object -Last 10 | ForEach-Object {
                            Write-Host "   $_" -ForegroundColor White
                        }
                    }
                }
                
                # Show total line count for context
                if ($AllContent) {
                    Write-Host "   📊 Total lines in file: $($AllContent.Count)" -ForegroundColor Gray
                }
            }
        }
        
        if (-not $FoundActivity) {
            Write-Host "⚠️  No extension activity found in fresh logs" -ForegroundColor Yellow
            Write-Host "🔍 Showing all log files for debugging:" -ForegroundColor Yellow
            foreach ($LogFile in $LogFiles) {
                $Content = Get-Content $LogFile.FullName -ErrorAction SilentlyContinue
                if ($Content) {
                    Write-Host "`n📄 $(Split-Path $LogFile.FullName -Leaf) (last 5 lines):" -ForegroundColor Cyan
                    $Content | Select-Object -Last 5 | ForEach-Object {
                        Write-Host "   $_" -ForegroundColor White
                    }
                }
            }
        }
    } else {
        Write-Host "⚠️  No log directory created" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  Log directory not found: $LogDir" -ForegroundColor Yellow
}

# Step 6: Clean up
Write-Host "🛑 Cleaning up..." -ForegroundColor Yellow
try {
    if (-not $ProcessExited) {
        # Only try to stop processes if they didn't exit naturally
        Write-Host "   🛑 Stopping VS Code processes..." -ForegroundColor Gray
        Stop-Process -Id $Process.Id -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        
        # Check if any VS Code processes are still running, then force if needed
        $StillRunning = Get-Process | Where-Object {
            $_.ProcessName -match "Code|Electron" -and
            $_.StartTime -gt $StartTime.AddSeconds(-5)
        }
        
        if ($StillRunning) {
            Write-Host "   🔨 Force stopping remaining processes..." -ForegroundColor Gray
            $StillRunning | Stop-Process -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host "   ✅ VS Code already exited, no processes to stop" -ForegroundColor Green
    }
    
    # Clean up temp directories
    $TempSessionDir = Join-Path $TempBase "immybot-vscode-test-$SessionId"
    if (Test-Path $TempSessionDir) {
        Write-Host "   🗑️  Removing temp directories..." -ForegroundColor Gray
        Remove-Item -Recurse -Force $TempSessionDir -ErrorAction SilentlyContinue
    }
} catch {
    # Ignore cleanup errors
}

Write-Host "✅ Debug complete" -ForegroundColor Green