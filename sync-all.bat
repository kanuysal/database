@echo off
set PROJECT_DIR=%~dp0
set API_DIR=D:\minadesign\github\antigravity\SERKAN\my-product-api
set KEYSTATIC_DIR=D:\minadesign\github\antigravity\SERKAN\Keystatic

echo --- MINA LIDYA FULL PACKAGE SYNC START ---

echo [1/4] Exporting Data from Keystatic...
cd /d %KEYSTATIC_DIR%
node export-api-data.cjs

echo [2/4] Preparing Assets and Updating API JSON...
cd /d %API_DIR%
node prepare-full-package.cjs

echo [3/4] Uploading New Assets to Cloudflare R2...
call upload-assets.bat

echo [4/4] Deploying Updated API to Cloudflare Workers...
call npx wrangler deploy

echo --- ALL SYSTEMS SYNCED! 🚀💎 ---
pause
