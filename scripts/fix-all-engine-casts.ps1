# Fix all remaining (engine as any) type casts across all animation and service files
$files = @(
  "src\app\game\services\animations\void-jump.animation.ts",
  "src\app\game\services\animations\gate-rite.animation.ts",
  "src\app\game\services\animations\speed-rite.animation.ts",
  "src\app\game\services\animations\disruption-rite.animation.ts",
  "src\app\game\services\game\solar-system.service.ts"
)

foreach ($file in $files) {
  if (Test-Path $file) {
    $content = Get-Content $file -Raw
    
    # Replace all (engine as any) property accesses with typed access
    $content = $content `
      -replace '\(engine as any\)\.voidJumpActive', 'engine.voidJumpActive' `
      -replace '\(engine as any\)\.collisionsDisabled', 'engine.collisionsDisabled' `
      -replace '\(engine as any\)\.applySpeedRite', 'engine.applySpeedRite' `
      -replace '\(engine as any\)\.showPlaceholderText', 'engine.showPlaceholderText' `
      -replace '\(engine as any\)\.textureManager', 'engine.textureManager' `
      -replace '\(engine as any\)\.spaceship', 'engine.spaceship' `
      -replace '\(engine as any\)\.gl', 'engine.gl' `
      -replace '\(engine as any\)\.shaderManager', 'engine.shaderManager' `
      -replace '\(engine as any\)\.camera', 'engine.camera' `
      -replace '\(engine as any\)\.overlayRenderer', 'engine.overlayRenderer' `
      -replace '\(engine as any\)\.applySolarSystemSnapshot', 'engine.applySolarSystemSnapshot' `
      -replace '\(engine as any\)\.portalRegistry', 'engine.portalRegistry' `
      -replace '\(engine as any\)\.hudManager', 'engine.hudManager' `
      -replace '\(engine as any\)\.startDisruptionBeam', 'engine.startDisruptionBeam' `
      -replace "\(engine as any\)\['planetDebris'\]", 'engine.planetDebris'
    
    $content | Set-Content $file -NoNewline
    Write-Host "Updated: $file" -ForegroundColor Green
  }
}

Write-Host "`nAll engine type casts fixed" -ForegroundColor Cyan
