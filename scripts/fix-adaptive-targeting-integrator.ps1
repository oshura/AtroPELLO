# Fix AdaptiveTargetingIntegrator type safety
$file = "src\app\game\targeting\v2\AdaptiveTargetingIntegrator.ts"

$content = Get-Content $file -Raw

# Replace method calls without as any
$content = $content `
  -replace '\(this\.adaptiveSystem as any\)\.setUseRaycastHover', 'this.adaptiveSystem.setUseRaycastHover' `
  -replace '\(this\.adaptiveSystem as any\)\.setDominantGateEnabled', 'this.adaptiveSystem.setDominantGateEnabled' `
  -replace '\(this\.adaptiveSystem as any\)\.setDominantRadiusFraction', 'this.adaptiveSystem.setDominantRadiusFraction' `
  -replace '\(this\.adaptiveSystem as any\)\.getProjectedRadiusPx', 'this.adaptiveSystem.getProjectedRadiusPx'

$content | Set-Content $file -NoNewline

Write-Host "AdaptiveTargetingIntegrator: Fixed method access" -ForegroundColor Green
