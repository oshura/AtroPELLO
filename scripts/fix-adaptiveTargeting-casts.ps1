# Fix adaptiveTargeting casts in GameEngine
$file = "src\app\game\GameEngine.ts"

$content = Get-Content $file -Raw

$content = $content `
  -replace '\(this\.adaptiveTargeting as any\)\?\.setUseRaycastHover', 'this.adaptiveTargeting?.setUseRaycastHover' `
  -replace '\(this\.adaptiveTargeting as any\)\?\.setDominantGateEnabled', 'this.adaptiveTargeting?.setDominantGateEnabled' `
  -replace '\(this\.adaptiveTargeting as any\)\?\.setDominantRadiusFraction', 'this.adaptiveTargeting?.setDominantRadiusFraction'

$content | Set-Content $file -NoNewline

Write-Host "GameEngine: Fixed adaptiveTargeting casts" -ForegroundColor Green
