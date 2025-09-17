#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Clean debug script for ImmyBot extension with isolated logs
.DESCRIPTION
    Uses --user-data-dir to create fresh logs, runs for 15 seconds, then analyzes
#>

param(
    [int]$TimeoutSeconds = 15
)

$WorkspaceFolder = (Get-Location).Path
Write-Host "🔧 Starting ImmyBot Extension Debug (Clean Logs)" -ForegroundColor Cyan

# Step 1: Build extension
Write-Host "🔨 Building extension..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist" -ErrorAction SilentlyContinue
}

$buildResult = npm run compile-web 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Extension built" -ForegroundColor Green

# Step 2: Create isolated environment in temp directory
$TempBase = [System.IO.Path]::GetTempPath()
$SessionId = [System.Guid]::NewGuid().ToString("N").Substring(0, 8)
$TestWorkspaceDir = Join-Path $TempBase "immybot-vscode-test-$SessionId" "workspace"
$UserDataDir = Join-Path $TempBase "immybot-vscode-test-$SessionId" "userdata"

Write-Host "📁 Using temp directories:" -ForegroundColor Gray
Write-Host "   Workspace: $TestWorkspaceDir" -ForegroundColor Gray
Write-Host "   UserData: $UserDataDir" -ForegroundColor Gray

# Clean previous runs and create new directories
@($TestWorkspaceDir, $UserDataDir) | ForEach-Object {
    if (Test-Path $_) {
        Remove-Item -Recurse -Force $_ -ErrorAction SilentlyContinue
    }
    New-Item -ItemType Directory -Path $_ -Force | Out-Null
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
    "--new-window"
)

$Process = Start-Process -FilePath "code" -ArgumentList $VSCodeArgs -PassThru
Write-Host "✅ VSCode launched (PID: $($Process.Id))" -ForegroundColor Green

# Step 4: Wait for extension to load
Write-Host "⏱️  Waiting $TimeoutSeconds seconds..." -ForegroundColor Yellow
Start-Sleep -Seconds $TimeoutSeconds

# Step 5: Analyze logs BEFORE killing
Write-Host "📋 Analyzing fresh logs..." -ForegroundColor Yellow

if (Test-Path $LogDir) {
    $LatestLogDir = Get-ChildItem -Path $LogDir -Directory | 
        Sort-Object LastWriteTime -Descending | 
        Select-Object -First 1

    if ($LatestLogDir) {
        Write-Host "📁 Log directory: $($LatestLogDir.Name)" -ForegroundColor Green
        
        # Get all log files
        $LogFiles = @()
        $LogFiles += Get-ChildItem -Path $LatestLogDir.FullName -Filter "*.log" -Recurse
        
        $FoundActivity = $false
        foreach ($LogFile in $LogFiles) {
            $Content = Get-Content $LogFile.FullName | Where-Object {
                $_ -match "immybot|immyfs|Sign In|authentication|ExtensionService.*ImmyBot" -or
                ($_ -match "error|Error|ERROR" -and $_ -match "immyfs|immybot")
            }
            
            if ($Content) {
                $FoundActivity = $true
                Write-Host "`n📄 $(Split-Path $LogFile.FullName -Leaf):" -ForegroundColor Cyan
                $Content | ForEach-Object {
                    $Color = if ($_ -match "error|Error|ERROR") { "Red" } else { "Green" }
                    Write-Host "   $_" -ForegroundColor $Color
                }
            }
        }
        
        if (-not $FoundActivity) {
            Write-Host "⚠️  No extension activity found in fresh logs" -ForegroundColor Yellow
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
    # Try graceful shutdown first
    Stop-Process -Id $Process.Id -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    
    # Check if process is still running, then force if needed
    $StillRunning = Get-Process | Where-Object {
        $_.ProcessName -match "Code|Electron" -and
        $_.StartTime -gt (Get-Date).AddMinutes(-2)
    }
    
    if ($StillRunning) {
        Write-Host "   🔨 Force stopping remaining processes..." -ForegroundColor Gray
        $StillRunning | Stop-Process -Force -ErrorAction SilentlyContinue
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