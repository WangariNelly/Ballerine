@echo off
setlocal enabledelayedexpansion

REM Set the root folder path
for %%I in ("%~dp0.") do set "SCRIPT_DIR=%%~fI"

REM Move one directory up
for %%I in ("%SCRIPT_DIR%\..") do set "PARENT_DIR=%%~fI"

set "WF_FOLDER=%PARENT_DIR%\services\workflows-service"
set "env_file=%WF_FOLDER%\.env"
set "env_example_file=%WF_FOLDER%\.env.example"
set "deploy_env_file=%PARENT_DIR%\deploy\.env"

REM Check if the .env file exists
if not exist "%env_file%" (
    echo .env file not found at %env_file%
    exit /b 1
)

REM Generate a new bcrypt salt using Node.js and TypeScript
cd /d "%WF_FOLDER%"
for /f "delims=" %%a in ('npx tsx "%WF_FOLDER%\scripts\generate-salt.ts"') do set "secret_value=%%a"
cd /d "%PARENT_DIR%"

REM Check if secret_value is empty
if "%secret_value%"=="" (
    echo Error: Unable to generate salt. Exiting...
    exit /b 1
)

REM Function to set the environment variable for Windows
call :set_bcrypt_salt_windows

REM Function to update the .env files
call :update_env_file

exit /b 0

:set_bcrypt_salt_windows
    echo Windows OS
    set "sanitized_value=%secret_value:$=^$%"
    goto :eof

:update_env_file
    set "adjusted_value=\"%sanitized_value%\""

    for %%f in ("%env_file%" "%env_example_file%" "%deploy_env_file%") do (
        findstr /v "^HASHING_KEY_SECRET_BASE64=" "%%f" > "%%f.tmp"
        move /y "%%f.tmp" "%%f" >nul
        echo HASHING_KEY_SECRET_BASE64=%sanitized_value%>> "%%f"
    )

    echo HASHING_KEY_SECRET_BASE64 has been set in the .env file with value: %adjusted_value%
    goto :eof