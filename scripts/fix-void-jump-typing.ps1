# Fix void-jump.animation.ts type safety
$file = "src\app\game\services\animations\void-jump.animation.ts"

# Replace (engine as any).property with engine.property
(Get-Content $file -Raw) `
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
  | Set-Content $file -NoNewline

Write-Host "✓ void-jump.animation.ts type safety updated" -ForegroundColor Green
