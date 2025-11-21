# Fix remaining (this as any) casts in GameEngine.ts
$file = "src\app\game\GameEngine.ts"

$content = Get-Content $file -Raw

# Replace all (this as any) patterns
$content = $content `
  -replace '\(this as any\)\.voidJumpActive', 'this.voidJumpActive' `
  -replace '!!\(this as any\)\.voidJumpActive', 'this.voidJumpActive' `
  -replace '\(this as any\)\.portalRenderer', 'this.portalRenderer' `
  -replace '\(this as any\)\._targetDetailsCache', 'this._targetDetailsCache' `
  -replace '\(\(this as any\)\._targetDetailsCache', '(this._targetDetailsCache'

$content | Set-Content $file -NoNewline

Write-Host "GameEngine.ts: Fixed (this as any) casts" -ForegroundColor Green
