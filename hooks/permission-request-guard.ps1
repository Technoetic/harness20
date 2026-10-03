# permission-request-guard.ps1 - PermissionRequest hook (Windows)
# Another plugin's PermissionRequest hook can answer allow and rewrite the tool input
# (hookSpecificOutput.decision.updatedInput, https://code.claude.com/docs/en/hooks). This hook
# denies such requests again, with a deny decision and exit 2 ("exit 2 -> Denies the permission"):
#   1. writes to protected or invalid paths (hooks/lib/approval-policy.mjs guard mode);
#   2. Bash commands in the block set of hooks/lib/command-guard.mjs, the same set that
#      destructive-guard blocks, so a command destructive-guard leaves to the user is never denied
#      here; and dangerous WebFetch URLs.
# Edits are never denied for their content. Anything else prints nothing (the user's dialog or
# another plugin decides). A relay: the decisions come from the two node modules, as in
# permission-request-guard.sh.
param()
$ErrorActionPreference = 'Continue'
# UTF-8 both ways: the event goes to node on stdin, and node's stdout is read back and rewritten.
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

# Check 1 decides only for edits and check 2 only for Bash and WebFetch, so the node start that
# cannot decide is skipped: on a loaded Windows machine each node start costs about a second of the
# 4.5 s budget. An event PowerShell cannot parse runs both checks, and the policy fails closed. The
# decisions match permission-request-guard.sh, which always runs both.
$tool = $null
try { $tool = [string]($raw | ConvertFrom-Json).tool_name } catch {}

# 1. Canonical and physical plugin protection.
if ($tool -notin @('Bash', 'WebFetch')) {
  $protection = $raw | & $node (Join-Path $PSScriptRoot 'lib/approval-policy.mjs') guard 2>$null
  if ($protection -eq 'protected') {
    [Console]::Out.Write('{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","reason":"harness36: protected or invalid path"}}}')
    exit 2
  }
}
if ($tool -in @('Write', 'Edit', 'MultiEdit', 'NotebookEdit')) { exit 0 }

# 2. The command catalog's block set and dangerous URLs. node's stderr is inherited.
$guard = Join-Path $PSScriptRoot 'lib/command-guard.mjs'
if (-not (Test-Path -LiteralPath $guard -PathType Leaf)) {
  [Console]::Error.WriteLine('Harness36: hooks/lib/command-guard.mjs is missing; permission-request-guard made no decision.')
  exit 1
}
$out = $raw | & $node $guard permission
$code = $LASTEXITCODE
if ($out) { [Console]::Out.Write(($out -join "`n")) }
if ($code -eq 2) { exit 2 }
exit 0
