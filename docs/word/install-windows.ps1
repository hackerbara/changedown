$ErrorActionPreference = "Stop"

$BaseUrl = $env:CHANGEDOWN_WORD_BASE_URL
if ([string]::IsNullOrWhiteSpace($BaseUrl)) { $BaseUrl = "https://changedown.com/word" }
$BaseUrl = $BaseUrl.TrimEnd("/")
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {
  # PowerShell 7+ and newer Windows builds do not need this; older Windows PowerShell
  # hosts may need it to negotiate HTTPS with the hosted installer assets.
}

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
$RunId = [Guid]::NewGuid().ToString("N").Substring(0, 8)
$LaunchPath = Join-Path $StateDir "ChangeDown-Launch-$RunId.docx"
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

function Get-XmlText($Xml, $XPath, $Description) {
  $Element = $Xml.SelectSingleNode($XPath)
  if ($null -eq $Element -or [string]::IsNullOrWhiteSpace($Element.InnerText)) {
    throw "Downloaded manifest is missing $Description."
  }
  return $Element.InnerText
}

function Get-XmlAttributeText($Xml, $XPath, $AttributeName, $Description) {
  $Element = $Xml.SelectSingleNode($XPath)
  if ($null -eq $Element -or $null -eq $Element.Attributes[$AttributeName] -or [string]::IsNullOrWhiteSpace($Element.Attributes[$AttributeName].Value)) {
    throw "Downloaded manifest is missing $Description."
  }
  return $Element.Attributes[$AttributeName].Value
}

function Test-DownloadedAssets {
  [xml]$Manifest = Get-Content -Raw -Path $ManifestPath
  $ManifestId = Get-XmlText $Manifest "/*[local-name()='OfficeApp']/*[local-name()='Id']" "Id"
  $ManifestVersion = Get-XmlText $Manifest "/*[local-name()='OfficeApp']/*[local-name()='Version']" "Version"
  $SourceLocation = Get-XmlAttributeText $Manifest "/*[local-name()='OfficeApp']/*[local-name()='DefaultSettings']/*[local-name()='SourceLocation']" "DefaultValue" "DefaultSettings SourceLocation"

  if ($ManifestId -ne $AddinId) {
    throw "Downloaded manifest id mismatch: expected $AddinId, got $ManifestId"
  }
  if ($SourceLocation -notlike "$BaseUrl/taskpane.html*") {
    throw "Downloaded manifest has unexpected SourceLocation: $SourceLocation"
  }
  if ($SourceLocation -notmatch '(\?|&)changedownMode=remote(&|$)') {
    throw "Downloaded manifest is not in remote pane mode: $SourceLocation"
  }

  $WebExtensionXml = Read-ZipEntryText $LaunchPath "word/webextensions/webextension.xml"
  if (-not $WebExtensionXml.Contains("id=`"$AddinId`"")) {
    throw "Launcher document does not reference ChangeDown add-in id $AddinId."
  }
  if (-not $WebExtensionXml.Contains("version=`"$ManifestVersion`"")) {
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

function Remove-OldLaunchers {
  $Cutoff = (Get-Date).AddDays(-7)
  Get-ChildItem -Path $StateDir -Filter "ChangeDown-Launch-*.docx" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $LaunchPath -and $_.LastWriteTime -lt $Cutoff } |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

Write-Host "Installing ChangeDown remote Word pane..."
Save-Download "$BaseUrl/manifest.remote.xml" $ManifestPath
Save-Download "$BaseUrl/ChangeDown-Launch.docx" $LaunchPath
Test-DownloadedAssets
Remove-ExistingChangeDownSideloads
Remove-OldLaunchers

New-Item -Path $RegistryPath -Force | Out-Null
New-ItemProperty -Path $RegistryPath -Name $AddinId -Value $ManifestPath -PropertyType String -Force | Out-Null

Write-Host "Registered manifest: $ManifestPath"
Write-Host "Opening launcher document: $LaunchPath"
Start-Process -FilePath $LaunchPath
