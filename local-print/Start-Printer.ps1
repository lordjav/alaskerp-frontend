param([string]$PythonPath = "python")
$ErrorActionPreference = 'Stop'
& $PythonPath (Join-Path $PSScriptRoot 'bridge.py') --show-token
