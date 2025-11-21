# Fix Camera.fov access in AdaptiveTargetingSystem
$file = "src\app\game\targeting\v2\AdaptiveTargetingSystem.ts"

$content = Get-Content $file -Raw
$content = $content -replace '\(this\.camera as any\)\.fov', 'this.camera.fov'
$content | Set-Content $file -NoNewline

Write-Host "AdaptiveTargetingSystem: Fixed camera.fov access" -ForegroundColor Green
