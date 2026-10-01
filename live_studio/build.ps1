<#
.SYNOPSIS
Builds the Fujitech Live Studio into a standalone Windows executable using PyInstaller.

.DESCRIPTION
This script prepares a clean virtual environment, installs required dependencies (including PyInstaller),
and packages the live_studio python module into a single standalone executable or directory.
It does NOT bundle third-party binaries (FFmpeg, MediaMTX) to avoid committing large binary blobs.
Those are handled by the runtime or setup script.

.EXAMPLE
.\build.ps1
#>

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path "..\."
$LiveStudioDir = "$ProjectRoot\live_studio"
$VenvDir = "$LiveStudioDir\.venv"
$DistDir = "$LiveStudioDir\dist"
$BuildDir = "$LiveStudioDir\build"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Building Fujitech Live Studio for Pilot " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Setup Virtual Environment
if (-not (Test-Path $VenvDir)) {
    Write-Host "Creating virtual environment..." -ForegroundColor Yellow
    python -m venv $VenvDir
}

# Activate Venv for this process
$env:VIRTUAL_ENV = $VenvDir
$env:Path = "$VenvDir\Scripts;" + $env:Path

# 2. Install Dependencies
Write-Host "Installing dependencies..." -ForegroundColor Yellow
pip install --upgrade pip
# Install standard dependencies
pip install -r "$LiveStudioDir\requirements.txt"
# Install pyinstaller
pip install pyinstaller

# 3. Clean previous builds
Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path $DistDir) { Remove-Item -Recurse -Force $DistDir }
if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }

# 4. Run PyInstaller
Write-Host "Running PyInstaller..." -ForegroundColor Yellow
Set-Location $LiveStudioDir
pyinstaller --name "FujitechLiveStudio" `
            --clean `
            --noconfirm `
            --onedir `
            --icon=NONE `
            --hidden-import "pygame" `
            --hidden-import "websockets" `
            --hidden-import "requests" `
            main.py

Write-Host "=========================================" -ForegroundColor Green
Write-Host " Build Complete! " -ForegroundColor Green
Write-Host " Output available at: $DistDir\FujitechLiveStudio" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

Write-Host "`nTo prepare a pilot machine, you must also provide FFmpeg and MediaMTX binaries" -ForegroundColor Yellow
Write-Host "in the 'bin' folder next to the executable, or ensure they are in the system PATH." -ForegroundColor Yellow
