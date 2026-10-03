# auto-approve.ps1 - PreToolUse hook (Write|Edit|MultiEdit|NotebookEdit|WebSearch, Windows)
# A relay of hooks/lib/approval-policy.mjs auto mode: allow is printed only when the policy
# answers 'eligible' (an active run; an in-project edit that is not sensitive, execution-linked or
# workflow state, and whose Edit/MultiEdit text holds no command hooks/lib/command-guard.mjs would
# block or ask about; or a WebSearch). Bash and WebFetch are never eligible. Anything else,
# including a missing node, prints nothing and keeps the host permission prompt. destructive-guard
# runs in parallel and its exit 2 takes precedence over an allow.
param()
$ErrorActionPreference = 'Continue'
# UTF-8 both ways: the event goes to node on stdin, and node's stdout is read back.
$OutputEncoding = [Text.UTF8Encoding]::new($false)
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch {}

$raw = $null
try {
  $reader = [System.IO.StreamReader]::new([Console]::OpenStandardInput(), [System.Text.Encoding]::UTF8)
  $raw = $reader.ReadToEnd()
  $reader.Close()
} catch {}
if (-not $raw) { exit 0 }

$node = $null
try { if ($env:HARNESS50_NODE -and (Test-Path -LiteralPath $env:HARNESS50_NODE -PathType Leaf)) { $node = $env:HARNESS50_NODE } } catch {}
if (-not $node) { $node = (Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source }
if (-not $node) { exit 0 }

$eligibility = $raw | & $node (Join-Path $PSScriptRoot 'lib/approval-policy.mjs') auto 2>$null
if ($LASTEXITCODE -ne 0 -or $eligibility -ne 'eligible') { exit 0 }
[Console]::Out.Write('{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"harness36 autopilot mode: eligible edit or WebSearch in an active run"}}')
exit 0
