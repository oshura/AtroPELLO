$files = @(
  "d:\Olles\AtroPELLO\src\app\game\services\animations\gate-rite.animation.ts",
  "d:\Olles\AtroPELLO\src\app\game\services\game\solar-system.service.ts"
)

foreach ($file in $files) {
  if (Test-Path $file) {
    $content = Get-Content $file -Raw
    
    # Reemplazar accesos a servicios opcionales
    $content = $content -replace "\(engine as any\)\['portalPersistenceService'\]",'engine.portalPersistenceService'
    $content = $content -replace "\(engine as any\)\['solarSystemService'\]",'engine.solarSystemService'
    $content = $content -replace "\(engine as any\)\['humanSolarSystemService'\]",'engine.humanSolarSystemService'
    $content = $content -replace "\(engine as any\)\['portalRegistry'\]",'engine.portalRegistry'
    $content = $content -replace "\(engine as any\)\['systemGeneratorService'\]",'engine.systemGeneratorService'
    $content = $content -replace "\(engine as any\)\['asteroidClusterService'\]",'engine.asteroidClusterService'
    
    # Portals quedó de antes
    $content = $content -replace "\(engine as any\)\['portals'\]",'engine.gameState.portals'
    
    # Reemplazar accesos con punto
    $content = $content -replace "const gl = \(engine as any\)\['gl'\] as",'const gl = engine.gl as'
    $content = $content -replace "\(engine as any\)\['camera'\]",'engine.camera'
    $content = $content -replace "\(engine as any\)\['shaderManager'\]",'engine.shaderManager'
    $content = $content -replace "\(engine as any\)\['overlayRenderer'\]",'engine.overlayRenderer'
    
    $content | Set-Content $file -NoNewline
    Write-Host "✅ $($file | Split-Path -Leaf)"
  }
}

Write-Host "`n✅ Servicios tipados"
