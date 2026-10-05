# permission-request-guard.ps1 - deterministic tool guard relay (Windows)
# Node owns bounded stdin decoding and the common tool policy. Never evaluate input.
param()
$ErrorActionPreference = 'Continue'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}
$node = $null
try { if ($env:HARNESS50_NODE -and (Test-Path -LiteralPath $env:HARNESS50_NODE -PathType Leaf)) { $node = $env:HARNESS50_NODE } } catch {}
if (-not $node) { $node = (Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source }
$guard = Join-Path $PSScriptRoot 'lib/command-guard.mjs'
if (-not $node -or -not (Test-Path -LiteralPath $guard -PathType Leaf)) {
  [Console]::Error.WriteLine('BLOCKED: Harness20 guard runtime is unavailable.')
  exit 2
}
# Native stdin remains attached: no unbounded ReadToEnd or intermediate shell string.
& $node $guard permission
$code = $LASTEXITCODE
if ($code -eq 0) { exit 0 }
if ($code -ne 2) { [Console]::Error.WriteLine('BLOCKED: Harness20 guard could not validate this tool request.') }
exit 2
