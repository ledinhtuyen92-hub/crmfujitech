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

# 4. Run PyInstaller using spec file (has all hidden imports for live_studio modules)
Write-Host "Running PyInstaller..." -ForegroundColor Yellow
Set-Location $LiveStudioDir

# PYTHONPATH must be the PARENT of live_studio/ so 'import live_studio.xxx' resolves
# ProjectRoot = d:\...\fujitech  (contains live_studio/ as a sub-package)
$env:PYTHONPATH = $ProjectRoot

pyinstaller --clean --noconfirm AutotechLiveStudio.spec

Write-Host "Copying configuration and assets..." -ForegroundColor Cyan
Copy-Item -Path "server_config.txt" -Destination "$DistDir\AutotechLiveStudio\server_config.txt" -Force
if (Test-Path "assets") {
    Copy-Item -Path "assets" -Destination "$DistDir\AutotechLiveStudio\assets" -Recurse -Force
}
if (Test-Path "bin") {
    Copy-Item -Path "bin" -Destination "$DistDir\AutotechLiveStudio\bin" -Recurse -Force
}

Write-Host "=========================================" -ForegroundColor Green
Write-Host " Build Complete! " -ForegroundColor Green
Write-Host " Output available at: $DistDir\AutotechLiveStudio" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green

Write-Host "`nTo prepare a pilot machine, you must also provide FFmpeg and MediaMTX binaries" -ForegroundColor Yellow
Write-Host "in the 'bin' folder next to the executable, or ensure they are in the system PATH." -ForegroundColor Yellow
