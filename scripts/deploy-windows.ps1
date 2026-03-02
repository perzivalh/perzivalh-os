[CmdletBinding()]
param(
  [string]$Branch = "",
  [switch]$SkipPull,
  [switch]$SkipInstall,
  [switch]$SkipBuild,
  [switch]$SkipSeeds,
  [switch]$SkipTenantProvision
)

$ErrorActionPreference = "Stop"

function Import-DotEnv {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path $Path)) {
    throw ".env not found at $Path"
  }

  foreach ($rawLine in Get-Content $Path) {
    $line = $rawLine.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $separatorIndex = $line.IndexOf("=")
      $name = $line.Substring(0, $separatorIndex).Trim()
      $value = $line.Substring($separatorIndex + 1)

      if (
        $value.Length -ge 2 -and
        (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'")))
      ) {
        $value = $value.Substring(1, $value.Length - 2)
      }

      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$envPath = Join-Path $repoRoot ".env"

Set-Location $repoRoot
Import-DotEnv -Path $envPath

if (-not $SkipPull) {
  if (-not (Test-Path (Join-Path $repoRoot ".git"))) {
    throw "This folder is not a git repository: $repoRoot"
  }

  git config --global --add safe.directory $repoRoot | Out-Null
  git fetch origin

  if ([string]::IsNullOrWhiteSpace($Branch)) {
    $Branch = (& git rev-parse --abbrev-ref HEAD).Trim()
  }

  if (-not [string]::IsNullOrWhiteSpace($Branch)) {
    git show-ref --verify --quiet "refs/heads/$Branch"
    if ($LASTEXITCODE -ne 0) {
      git checkout -b $Branch "origin/$Branch"
    } else {
      git checkout $Branch
    }
    git pull --ff-only origin $Branch
  }
}

if (-not $SkipInstall) {
  npm install
}

if (-not $SkipBuild) {
  npm run build
}

node .\scripts\provision-control-db.js

if (-not $SkipTenantProvision -and -not [string]::IsNullOrWhiteSpace($env:TENANT_DB_URL)) {
  node .\scripts\provision-tenant-db.js $env:TENANT_DB_URL
} else {
  Write-Host "Skipping tenant DB provision (TENANT_DB_URL not set or -SkipTenantProvision used)."
}

if (-not $SkipSeeds) {
  if (-not [string]::IsNullOrWhiteSpace($env:SUPERADMIN_EMAIL) -and -not [string]::IsNullOrWhiteSpace($env:SUPERADMIN_PASSWORD)) {
    npm run seed:superadmin
  } else {
    Write-Host "Skipping superadmin seed (SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD missing)."
  }

  if (
    -not [string]::IsNullOrWhiteSpace($env:TENANT_DB_URL) -and
    -not [string]::IsNullOrWhiteSpace($env:ADMIN_EMAIL) -and
    -not [string]::IsNullOrWhiteSpace($env:ADMIN_PASSWORD)
  ) {
    npm run seed:admin
  } else {
    Write-Host "Skipping tenant admin seed (TENANT_DB_URL or ADMIN_* missing)."
  }
}

pm2 startOrReload .\ecosystem.config.js --update-env
pm2 save

Write-Host "Deploy completed successfully."
