# Fix gate-rite.animation.ts type safety - remaining (engine as any) casts
$file = "src\app\game\services\animations\gate-rite.animation.ts"

# Replace (engine as any).property with engine.property for public properties
(Get-Content $file -Raw) `
  -replace '\(engine as any\)\.showPlaceholderText', 'engine.showPlaceholderText' `
  -replace '\(engine as any\)\?\.logger', 'engine.logger' `
  | Set-Content $file -NoNewline

Write-Host "gate-rite.animation.ts type safety updated" -ForegroundColor Green
