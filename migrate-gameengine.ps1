$file = "d:\Olles\AtroPELLO\src\app\game\GameEngine.ts"
$content = Get-Content $file -Raw

# Reemplazar this.planets -> this.gameState.planets (excepto donde ya dice gameState)
$content = $content -replace '(?<![.\w])this\.planets\b','this.gameState.planets'

# Reemplazar this.portals -> this.gameState.portals
$content = $content -replace '(?<![.\w])this\.portals\b','this.gameState.portals'

# Reemplazar this.primarySun -> this.gameState.sun
$content = $content -replace '(?<![.\w])this\.primarySun\b','this.gameState.sun'

# Reemplazar this.independentAsteroids -> this.gameState.independentAsteroids
$content = $content -replace '(?<![.\w])this\.independentAsteroids\b','this.gameState.independentAsteroids'

# Reemplazar this.superAsteroids -> this.gameState.superAsteroids
$content = $content -replace '(?<![.\w])this\.superAsteroids\b','this.gameState.superAsteroids'

# Reemplazar this.megaAsteroids -> this.gameState.megaAsteroids
$content = $content -replace '(?<![.\w])this\.megaAsteroids\b','this.gameState.megaAsteroids'

# Reemplazar this.dopplerCues -> this.gameState.dopplerCues
$content = $content -replace '(?<![.\w])this\.dopplerCues\b','this.gameState.dopplerCues'

# Reemplazar this.collisionDamageCooldown -> this.gameState.collisionCooldowns
$content = $content -replace '(?<![.\w])this\.collisionDamageCooldown\b','this.gameState.collisionCooldowns'

$content | Set-Content $file -NoNewline
Write-Host "✅ Migration complete"
