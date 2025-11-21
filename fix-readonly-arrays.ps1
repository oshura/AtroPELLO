$file = "d:\Olles\AtroPELLO\src\app\game\GameEngine.ts"
$content = Get-Content $file -Raw

# Reemplazar asignaciones de arrays readonly por .length = 0
$content = $content -replace 'this\.gameState\.portals\s*=\s*\[\]','this.gameState.portals.length = 0'
$content = $content -replace 'this\.gameState\.planets\s*=\s*\[\]','this.gameState.planets.length = 0'
$content = $content -replace 'this\.gameState\.superAsteroids\s*=\s*\[\]','this.gameState.superAsteroids.length = 0'
$content = $content -replace 'this\.gameState\.independentAsteroids\s*=\s*\[\]','this.gameState.independentAsteroids.length = 0'
$content = $content -replace 'this\.gameState\.megaAsteroids\s*=\s*\[\]','this.gameState.megaAsteroids.length = 0'

# Eliminar this.asteroids (era para clusters, ahora está en AsteroidClusterService)
$content = $content -replace 'this\.asteroids\s*=\s*\[\];?\s*\n',''
$content = $content -replace 'this\.asteroids\.length','0 /* TODO: Get from cluster service */'
$content = $content -replace 'this\.asteroids\.findIndex[^\n]+\n[^\n]+\n','/* TODO: Remove from cluster service */'+"`n"

$content | Set-Content $file -NoNewline
Write-Host "✅ Readonly arrays fixed"
