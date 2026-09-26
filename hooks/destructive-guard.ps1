# destructive-guard.ps1 - PreToolUse(Bash) hook (Windows)
# A relay: hooks/lib/command-guard.mjs decides for this script and for destructive-guard.sh alike.
#   block: exit 2 with the rule on stderr (cannot be approved)
#   ask:   a PreToolUse permission decision 'ask' on stdout (the user confirms)
#   pass:  no output, exit 0 (the host permission checks apply)
# The event is handed to node on stdin and is never evaluated here. Without node the hook makes no
# decision (exit 0); run-hook.mjs always passes the node it runs on as HARNESS50_NODE.
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

$guard = Join-Path $PSScriptRoot 'lib/command-guard.mjs'
if (-not (Test-Path -LiteralPath $guard -PathType Leaf)) {
  [Console]::Error.WriteLine('Harness50: hooks/lib/command-guard.mjs is missing; destructive-guard made no decision.')
  exit 1
}
# node's stderr is inherited and reaches the host unchanged.
$out = $raw | & $node $guard pretool
$code = $LASTEXITCODE
if ($out) { [Console]::Out.Write(($out -join "`n")) }
exit $code
