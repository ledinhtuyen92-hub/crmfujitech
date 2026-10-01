<#
.SYNOPSIS
Prepares the pilot environment for Fujitech Live Studio by downloading required external binaries.

.DESCRIPTION
This script creates the necessary directory structure and downloads FFmpeg and MediaMTX
into the correct 'bin' directory to avoid committing large binaries to source control.

.EXAMPLE
.\setup_pilot.ps1
#>

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path "..\."
$LiveStudioDir = "$ProjectRoot\live_studio"
$BinDir = "$LiveStudioDir\bin"
$FfmpegDir = "$BinDir\ffmpeg"
$MediaMtxDir = "$BinDir\mediamtx"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Setting up Pilot Environment Dependencies" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Create Directories
if (-not (Test-Path $FfmpegDir)) { New-Item -ItemType Directory -Force -Path $FfmpegDir | Out-Null }
if (-not (Test-Path $MediaMtxDir)) { New-Item -ItemType Directory -Force -Path $MediaMtxDir | Out-Null }

# 2. Download MediaMTX (Windows amd64)
$MediaMtxUrl = "https://github.com/bluenviron/mediamtx/releases/download/v1.6.0/mediamtx_v1.6.0_windows_amd64.zip"
$MediaMtxZip = "$BinDir\mediamtx.zip"

if (-not (Test-Path "$MediaMtxDir\mediamtx.exe")) {
    Write-Host "Downloading MediaMTX..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $MediaMtxUrl -OutFile $MediaMtxZip
    Write-Host "Extracting MediaMTX..." -ForegroundColor Yellow
    Expand-Archive -Path $MediaMtxZip -DestinationPath $MediaMtxDir -Force
    Remove-Item -Force $MediaMtxZip
    Write-Host "MediaMTX downloaded and extracted." -ForegroundColor Green
} else {
    Write-Host "MediaMTX already exists." -ForegroundColor Gray
}

# 3. Download FFmpeg (Windows build from gyan.dev)
$FfmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$FfmpegZip = "$BinDir\ffmpeg.zip"

if (-not (Test-Path "$FfmpegDir\ffmpeg.exe")) {
    Write-Host "Downloading FFmpeg..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri $FfmpegUrl -OutFile $FfmpegZip
    Write-Host "Extracting FFmpeg (this might take a moment)..." -ForegroundColor Yellow
    # Extract to a temp directory since it contains a nested folder
    $TempFfmpegDir = "$BinDir\ffmpeg_temp"
    Expand-Archive -Path $FfmpegZip -DestinationPath $TempFfmpegDir -Force
    
    # Move ffmpeg.exe and ffprobe.exe to the final directory
    $ExtractedBin = Get-ChildItem -Path $TempFfmpegDir -Directory | Select-Object -First 1
    Move-Item -Path "$($ExtractedBin.FullName)\bin\ffmpeg.exe" -Destination $FfmpegDir -Force
    Move-Item -Path "$($ExtractedBin.FullName)\bin\ffprobe.exe" -Destination $FfmpegDir -Force
    
    # Cleanup
    Remove-Item -Recurse -Force $TempFfmpegDir
    Remove-Item -Force $FfmpegZip
    Write-Host "FFmpeg downloaded and extracted." -ForegroundColor Green
} else {
    Write-Host "FFmpeg already exists." -ForegroundColor Gray
}

Write-Host "=========================================" -ForegroundColor Green
Write-Host " Environment Setup Complete! " -ForegroundColor Green
Write-Host " You can now run .\build.ps1 to package the Live Studio." -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
