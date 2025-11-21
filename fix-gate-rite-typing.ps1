$file = "d:\Olles\AtroPELLO\src\app\game\services\animations\gate-rite.animation.ts"
$content = Get-Content $file -Raw

# Reemplazar accesos a spaceship
$content = $content -replace "\(engine as any\)\['spaceship'\]",'engine.spaceship'

# Reemplazar accesos a camera
$content = $content -replace "const cam: any = \(engine as any\)\.camera",'const cam = engine.camera'

# Reemplazar accesos a gl
$content = $content -replace "const gl = \(engine as any\)\.gl",'const gl = engine.gl'

# Reemplazar accesos a targetCatalog
$content = $content -replace "\(engine as any\)\['targetCatalog'\]",'engine.targetCatalog'

$content | Set-Content $file -NoNewline
Write-Host "✅ Tipado correcto aplicado en gate-rite.animation.ts"
