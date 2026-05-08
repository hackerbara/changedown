$ErrorActionPreference = "Stop"

$BaseUrl = $env:CHANGEDOWN_WORD_BASE_URL
if ([string]::IsNullOrWhiteSpace($BaseUrl)) { $BaseUrl = "https://changedown.com/word" }
$BaseUrl = $BaseUrl.TrimEnd("/")

$AddinId = "a3f7c142-84b2-4e9d-b031-cd2e7f85a301"
$StateDir = Join-Path $env:LOCALAPPDATA "ChangeDown\Word"
$ManifestPath = Join-Path $StateDir "manifest.remote.xml"
$LaunchPath = Join-Path $StateDir "ChangeDown-Launch.docx"
$RegistryPath = "HKCU:\SOFTWARE\Microsoft\Office\16.0\Wef\Developer"

New-Item -ItemType Directory -Path $StateDir -Force | Out-Null

function Save-Download($Uri, $Path) {
  $TempPath = "$Path.tmp"
  Invoke-WebRequest -Uri $Uri -OutFile $TempPath -UseBasicParsing
  Move-Item -Path $TempPath -Destination $Path -Force
}

Write-Host "Installing ChangeDown remote Word pane..."
Save-Download "$BaseUrl/manifest.remote.xml" $ManifestPath
Save-Download "$BaseUrl/ChangeDown-Launch.docx" $LaunchPath

New-Item -Path $RegistryPath -Force | Out-Null
New-ItemProperty -Path $RegistryPath -Name $AddinId -Value $ManifestPath -PropertyType String -Force | Out-Null

Write-Host "Registered manifest: $ManifestPath"
Write-Host "Opening launcher document: $LaunchPath"
Start-Process $LaunchPath
