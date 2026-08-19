<#
.SYNOPSIS
  One-shot deploy for the travlr story-render pipeline:
    1. Build the render IIFE bundle + compile the worker
    2. Deploy the worker to Fly.io (app: mapimages-render) with its secrets
    3. Configure the Supabase render-story Edge Function to point at it
    4. Ensure the story-renders storage bucket exists

.DESCRIPTION
  Idempotent — safe to re-run. Requires `flyctl` and `supabase` CLIs on PATH,
  both already authenticated (`fly auth login`, `supabase login`).

  Secrets are read from parameters or environment variables. Nothing secret is
  written to disk. RENDER_SECRET is auto-generated on first run if not supplied;
  the SAME value is set as the worker's WORKER_SECRET and the Edge Function's
  RENDER_SECRET so their handshake matches.

.EXAMPLE
  # First run — supply the Supabase service-role key (find it in
  # Dashboard → Project Settings → API → service_role secret):
  $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."
  ./deploy.ps1

.EXAMPLE
  # Re-deploy code only, reusing existing secrets already set on Fly/Supabase:
  ./deploy.ps1 -SkipSecrets
#>
[CmdletBinding()]
param(
  [string]$FlyApp        = "mapimages-render",
  [string]$ProjectRef    = "vafmymyjxabkgkijcatd",
  [string]$WorkerUrl     = "https://mapimages-render.fly.dev",
  [string]$SupabaseUrl   = "https://vafmymyjxabkgkijcatd.supabase.co",
  # Secrets (fall back to env vars). Leave RenderSecret empty to auto-generate.
  [string]$ServiceRoleKey = $env:SUPABASE_SERVICE_ROLE_KEY,
  [string]$RenderSecret   = $env:RENDER_SECRET,
  # Skip all secret-setting (code-only redeploy)
  [switch]$SkipSecrets,
  # Skip the Fly deploy (e.g. only re-point the Edge Function)
  [switch]$SkipWorker
)

$ErrorActionPreference = "Stop"
$RepoRoot   = Resolve-Path (Join-Path $PSScriptRoot "..")
$ServerDir  = $PSScriptRoot

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Need($cmd) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    throw "$cmd not found on PATH. Install it and authenticate before running."
  }
}

# ── Preflight ────────────────────────────────────────────────────────────────
Step "Preflight"
Need "npm"
if (-not $SkipWorker)  { Need "flyctl" }
if (-not $SkipSecrets) { Need "supabase" }
Write-Host "Repo:   $RepoRoot"
Write-Host "Server: $ServerDir"

# ── 1. Build ─────────────────────────────────────────────────────────────────
Step "Build render bundle (server/public/render-lib.iife.js)"
Push-Location $RepoRoot
try { npm run build:render } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw "build:render failed" }

Step "Compile worker (server/dist)"
Push-Location $ServerDir
try { npm run build } finally { Pop-Location }
if ($LASTEXITCODE -ne 0) { throw "server build failed" }

# ── 2. Resolve the shared secret ─────────────────────────────────────────────
if (-not $SkipSecrets) {
  if ([string]::IsNullOrWhiteSpace($ServiceRoleKey)) {
    throw "SUPABASE_SERVICE_ROLE_KEY is required (param -ServiceRoleKey or env var). " +
          "Dashboard -> Project Settings -> API -> service_role secret."
  }
  if ([string]::IsNullOrWhiteSpace($RenderSecret)) {
    $bytes = New-Object 'System.Byte[]' 24
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $RenderSecret = [Convert]::ToBase64String($bytes) -replace '[+/=]', 'x'
    Write-Host "Generated a new RENDER_SECRET (stored only on Fly + Supabase)." -ForegroundColor Yellow
  }
}

# ── 3. Fly secrets + deploy ──────────────────────────────────────────────────
if (-not $SkipWorker) {
  if (-not $SkipSecrets) {
    Step "Set Fly secrets on $FlyApp"
    # --stage: queue secrets so the very next deploy applies them in one release
    flyctl secrets set `
      "SUPABASE_URL=$SupabaseUrl" `
      "SUPABASE_SERVICE_ROLE_KEY=$ServiceRoleKey" `
      "WORKER_SECRET=$RenderSecret" `
      --app $FlyApp --stage
    if ($LASTEXITCODE -ne 0) { throw "fly secrets set failed" }
  }

  Step "Deploy worker to Fly ($FlyApp)"
  Push-Location $ServerDir
  try { flyctl deploy --app $FlyApp } finally { Pop-Location }
  if ($LASTEXITCODE -ne 0) { throw "fly deploy failed" }
}

# ── 4. Supabase: bucket + Edge Function secrets ──────────────────────────────
if (-not $SkipSecrets) {
  Step "Ensure story-renders bucket (supabase/setup.sql)"
  $setupSql = Join-Path $RepoRoot "supabase\setup.sql"
  if (Test-Path $setupSql) {
    # `create policy` is not idempotent; ignore "already exists" on re-runs.
    try { supabase db execute --project-ref $ProjectRef --file $setupSql }
    catch { Write-Host "  (bucket/policies likely already exist — continuing)" -ForegroundColor DarkYellow }
  } else {
    Write-Host "  setup.sql not found at $setupSql — create the story-renders bucket manually." -ForegroundColor Yellow
  }

  Step "Set Edge Function secrets (render-story -> worker)"
  supabase secrets set `
    "RENDER_WORKER_URL=$WorkerUrl" `
    "RENDER_SECRET=$RenderSecret" `
    --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) { throw "supabase secrets set failed" }
}

# ── Smoke test ───────────────────────────────────────────────────────────────
Step "Worker health check"
try {
  $health = Invoke-RestMethod -Uri "$WorkerUrl/health" -TimeoutSec 20
  Write-Host "  /health -> $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
  Write-Host "  /health unreachable: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "  (If you just deployed, give the machine ~30s to start, then retry.)" -ForegroundColor DarkYellow
}

Step "Done"
Write-Host "Pipeline: webpage share.js -> render-story Edge Fn -> $FlyApp -> story-renders bucket" -ForegroundColor Green
Write-Host "Test it from the PWA: open a diary, tap a marker, hit Share, pick a style, Create image."
