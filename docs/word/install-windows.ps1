$ErrorActionPreference = "Stop"

$BaseUrl = $env:CHANGEDOWN_WORD_BASE_URL
if ([string]::IsNullOrWhiteSpace($BaseUrl)) { $BaseUrl = "https://changedown.com/word" }
$BaseUrl = $BaseUrl.TrimEnd("/")

$AddinId = "a3f7c142-84b2-4e9d-b031-cd2e7f85a301"
$LocalDevAddinId = "d3b6b0d7-c5e8-4a81-8d9f-9d8cf7e6d051"
$KnownAddinIds = @($AddinId, $LocalDevAddinId)
$LocalAppData = $env:LOCALAPPDATA
if ([string]::IsNullOrWhiteSpace($LocalAppData)) {
  $LocalAppData = [Environment]::GetFolderPath("LocalApplicationData")
}
if ([string]::IsNullOrWhiteSpace($LocalAppData)) {
  throw "Could not determine LOCALAPPDATA for the current user."
}
$StateDir = Join-Path $LocalAppData "ChangeDown\Word"
$ManifestPath = Join-Path $StateDir "manifest.remote.xml"
$LaunchPath = Join-Path $StateDir "ChangeDown-Launch.docx"
$RegistryPath = "HKCU:\SOFTWARE\Microsoft\Office\16.0\Wef\Developer"

New-Item -ItemType Directory -Path $StateDir -Force | Out-Null

function Save-Download($Uri, $Path) {
  $TempPath = "$Path.$([Guid]::NewGuid().ToString('N')).tmp"
  try {
    Invoke-WebRequest -Uri $Uri -OutFile $TempPath -UseBasicParsing -Headers @{ "Cache-Control" = "no-cache" }
    Move-Item -Path $TempPath -Destination $Path -Force
  } finally {
    if (Test-Path $TempPath) {
      Remove-Item -Path $TempPath -Force -ErrorAction SilentlyContinue
    }
  }
}

function Read-ZipEntryText($ZipPath, $EntryName) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $Zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $Entry = $Zip.GetEntry($EntryName)
    if ($null -eq $Entry) {
      throw "Missing $EntryName in $ZipPath"
    }
    $Reader = New-Object System.IO.StreamReader($Entry.Open(), [System.Text.Encoding]::UTF8, $true)
    try {
      return $Reader.ReadToEnd()
    } finally {
      $Reader.Dispose()
    }
  } finally {
    $Zip.Dispose()
  }
}

function Test-DownloadedAssets {
  [xml]$Manifest = Get-Content -Raw -Path $ManifestPath
  $ManifestId = $Manifest.OfficeApp.Id
  $ManifestVersion = $Manifest.OfficeApp.Version
  $SourceLocation = $Manifest.OfficeApp.DefaultSettings.SourceLocation.DefaultValue

  if ($ManifestId -ne $AddinId) {
    throw "Downloaded manifest id mismatch: expected $AddinId, got $ManifestId"
  }
  if ([string]::IsNullOrWhiteSpace($ManifestVersion)) {
    throw "Downloaded manifest is missing Version."
  }
  if ($SourceLocation -notlike "https://changedown.com/word/taskpane.html*") {
    throw "Downloaded manifest has unexpected SourceLocation: $SourceLocation"
  }

  $WebExtensionXml = Read-ZipEntryText $LaunchPath "word/webextensions/webextension.xml"
  if ($WebExtensionXml -notmatch [regex]::Escape("id=`"$AddinId`"")) {
    throw "Launcher document does not reference ChangeDown add-in id $AddinId."
  }
  if ($WebExtensionXml -notmatch [regex]::Escape("version=`"$ManifestVersion`"")) {
    throw "Launcher document version does not match manifest version $ManifestVersion."
  }
}

function Remove-StaleRegistryValue($Name) {
  $Property = Get-ItemProperty -Path $RegistryPath -Name $Name -ErrorAction SilentlyContinue
  if ($null -ne $Property) {
    Write-Host "Removing old ChangeDown sideload registration: $Name"
    Remove-ItemProperty -Path $RegistryPath -Name $Name -ErrorAction SilentlyContinue
  }
}

function Remove-ExistingChangeDownSideloads {
  if (-not (Test-Path $RegistryPath)) { return }

  foreach ($KnownAddinId in $KnownAddinIds) {
    Remove-StaleRegistryValue $KnownAddinId
  }
  Remove-StaleRegistryValue $ManifestPath
}

Write-Host "Installing ChangeDown remote Word pane..."
Remove-ExistingChangeDownSideloads
Save-Download "$BaseUrl/manifest.remote.xml" $ManifestPath
Save-Download "$BaseUrl/ChangeDown-Launch.docx" $LaunchPath
Test-DownloadedAssets

New-Item -Path $RegistryPath -Force | Out-Null
New-ItemProperty -Path $RegistryPath -Name $AddinId -Value $ManifestPath -PropertyType String -Force | Out-Null

Write-Host "Registered manifest: $ManifestPath"
Write-Host "Opening launcher document: $LaunchPath"
Start-Process -FilePath $LaunchPath
