$files = @(
  "d:\Olles\AtroPELLO\src\app\game\services\animations\gate-rite.animation.ts",
  "d:\Olles\AtroPELLO\src\app\game\services\animations\speed-rite.animation.ts",
  "d:\Olles\AtroPELLO\src\app\game\services\animations\eternal-rite.animation.ts",
  "d:\Olles\AtroPELLO\src\app\game\services\animations\disruption-rite.animation.ts"
)

foreach ($file in $files) {
  if (Test-Path $file) {
    $content = Get-Content $file -Raw
    
    # Reemplazar accesos tipables
    $content = $content -replace "const gl = \(engine as any\)\.gl",'const gl = engine.gl'
    $content = $content -replace "\(engine as any\)\.camera",'engine.camera'
    $content = $content -replace "\(engine as any\)\.gl",'engine.gl'
    $content = $content -replace "engine\.targetCatalog",'engine.targetCatalog'
    $content = $content -replace "\(engine as any\)\['spaceship'\]",'engine.spaceship'
    $content = $content -replace "\(engine as any\)\.spaceship",'engine.spaceship'
    
    $content | Set-Content $file -NoNewline
    Write-Host "✅ $($file | Split-Path -Leaf)"
  }
}

Write-Host "`n✅ Tipado aplicado a todas las animaciones"
