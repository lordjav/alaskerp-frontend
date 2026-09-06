param([string]$RuntimeArchive)
$ErrorActionPreference = 'Stop'
$installRoot = Join-Path $env:LOCALAPPDATA 'AlaskerpPrint'
$programsRoot = Join-Path ([Environment]::GetFolderPath('Programs')) 'Alaska Caja'
$startupLink = Join-Path ([Environment]::GetFolderPath('Startup')) 'Alaska Caja.lnk'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Se requiere Windows de 64 bits con .NET Framework 4.' }
$running = Get-Process -Name AlaskaCaja -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq (Join-Path $installRoot 'AlaskaCaja.exe') }
if ($running) { throw 'Cierra Alaska Caja desde su icono junto al reloj > Salir del conector antes de actualizar.' }
New-Item -ItemType Directory -Force -Path $installRoot,(Join-Path $installRoot 'runtime'),(Join-Path $installRoot 'data'),$programsRoot | Out-Null
if (-not $RuntimeArchive -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'python-runtime.zip'))) { $RuntimeArchive = Join-Path $PSScriptRoot 'python-runtime.zip' }
if (-not $RuntimeArchive) {
    $RuntimeArchive = Join-Path $installRoot 'python-runtime.zip'
    Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.13.15/python-3.13.15-embed-amd64.zip' -OutFile $RuntimeArchive
}
$expectedHash = 'd1f04d990aee1253d8569e8e5104e30fa9f5fa830899f14843448872d936a2cf'
if ((Get-FileHash -LiteralPath $RuntimeArchive -Algorithm SHA256).Hash -ne $expectedHash) { throw 'El runtime no coincide con el SHA256 publicado por Python.org.' }
Expand-Archive -LiteralPath $RuntimeArchive -DestinationPath (Join-Path $installRoot 'runtime') -Force
$pythonExe = Join-Path $installRoot 'runtime\python.exe'
& $pythonExe -c 'import sqlite3, ctypes, http.server'
if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar el runtime.' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'bridge.py') -Destination (Join-Path $installRoot 'bridge.py') -Force
& $compiler /nologo /target:winexe "/out:$installRoot\AlaskaCaja.exe" "/win32icon:$PSScriptRoot\AlaskaCaja.ico" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll (Join-Path $PSScriptRoot 'AlaskaCaja.cs')
if ($LASTEXITCODE -ne 0) { throw 'No se pudo compilar Alaska Caja.' }
# Preserve the key and durable job history when migrating the console prototype.
# Stop that prototype before running this installer so its SQLite file is closed.
foreach ($name in @('token.txt','jobs.sqlite3')) {
    $oldData = Join-Path $PSScriptRoot ".local\$name"
    $newData = Join-Path $installRoot "data\$name"
    if ((Test-Path -LiteralPath $oldData) -and -not (Test-Path -LiteralPath $newData)) {
        Copy-Item -LiteralPath $oldData -Destination $newData
    }
}
$shortcutShell = New-Object -ComObject WScript.Shell
foreach ($linkPath in @((Join-Path $programsRoot 'Alaska Caja.lnk'),$startupLink)) {
    $shortcut = $shortcutShell.CreateShortcut($linkPath)
    $shortcut.TargetPath = Join-Path $installRoot 'AlaskaCaja.exe'
    $shortcut.WorkingDirectory = $installRoot
    $shortcut.IconLocation = (Join-Path $installRoot 'AlaskaCaja.exe') + ',0'
    $shortcut.Description = 'Alaska Caja: impresora y apertura independiente del cajón'
    if ($linkPath -eq $startupLink) { $shortcut.Arguments = '--background'; $shortcut.WindowStyle = 7 }
    $shortcut.Save()
}
Start-Process -FilePath (Join-Path $installRoot 'AlaskaCaja.exe') -ArgumentList '--background' -WindowStyle Minimized
Write-Output 'Alaska Caja instalada. Se inicia al entrar a Windows y permanece en la barra de tareas.'
Write-Output 'Abre Alaska Caja > Copiar clave para la web y pégala en Tiquetes e impresora del POS.'
