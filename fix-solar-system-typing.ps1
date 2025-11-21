$file = "d:\Olles\AtroPELLO\src\app\game\services\game\solar-system.service.ts"
$content = Get-Content $file -Raw

# Reemplazar accesos a propiedades públicas
$content = $content -replace "\(engine as any\)\['gl'\]",'engine.gl'
$content = $content -replace "\(engine as any\)\['logger'\]",'engine.logger'
$content = $content -replace "\(engine as any\)\['targetCatalog'\]",'engine.targetCatalog'
$content = $content -replace "\(engine as any\)\.gl",'engine.gl'
$content = $content -replace "\(engine as any\)\.logger",'engine.logger'
$content = $content -replace "\(engine as any\)\.camera",'engine.camera'
$content = $content -replace "\(engine as any\)\.spaceship",'engine.spaceship'

# Reemplazar accesos a gameState
$content = $content -replace "\(engine as any\)\['planets'\]",'engine.gameState.planets'
$content = $content -replace "\(engine as any\)\['portals'\]",'engine.gameState.portals'
$content = $content -replace "\(engine as any\)\['primarySun'\]",'engine.gameState.sun'

$content | Set-Content $file -NoNewline
Write-Host "✅ solar-system.service.ts tipado"
