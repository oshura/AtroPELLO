# Generates simple WAV placeholders (16-bit PCM) for the game's audio assets.
# Output: public/assets/audio/*.wav
# Requirements: Windows PowerShell (v5+) or PowerShell Core.
# Usage:
#   pwsh -File .\scripts\audio\generate-placeholders.ps1
#   # or
#   powershell -ExecutionPolicy Bypass -File .\scripts\audio\generate-placeholders.ps1

param(
  [string]$OutDir = "src/app/assets/audio",
  [int]$SampleRate = 44100
)

# Ensure output directory exists
$resolvedOut = Join-Path (Get-Location) $OutDir
New-Item -ItemType Directory -Force -Path $resolvedOut | Out-Null

function Write-LittleEndianInt16([System.IO.BinaryWriter]$bw, [int]$value) {
  $bw.Write([byte]($value -band 0xFF))
  $bw.Write([byte](($value -shr 8) -band 0xFF))
}

function Write-LittleEndianInt32([System.IO.BinaryWriter]$bw, [int]$value) {
  $bw.Write([byte]($value -band 0xFF))
  $bw.Write([byte](($value -shr 8) -band 0xFF))
  $bw.Write([byte](($value -shr 16) -band 0xFF))
  $bw.Write([byte](($value -shr 24) -band 0xFF))
}

function New-WavFile {
  param(
    [string]$Path,
    [double]$DurationSec,
    [int]$SampleRate = 44100,
    [int]$Channels = 1,
    [scriptblock]$SampleFunction
  )
  $totalSamples = [int]([math]::Round($DurationSec * $SampleRate))
  $bitsPerSample = 16
  $blockAlign = [int]($Channels * ($bitsPerSample / 8))
  $byteRate = $SampleRate * $blockAlign
  $dataSize = $totalSamples * $blockAlign
  $riffSize = 36 + $dataSize

  $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create)
  $bw = New-Object System.IO.BinaryWriter($fs)

  # RIFF header
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes("RIFF"))
  Write-LittleEndianInt32 $bw $riffSize
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes("WAVE"))

  # fmt chunk
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes("fmt "))
  Write-LittleEndianInt32 $bw 16                    # PCM chunk size
  Write-LittleEndianInt16 $bw 1                     # PCM format tag
  Write-LittleEndianInt16 $bw $Channels
  Write-LittleEndianInt32 $bw $SampleRate
  Write-LittleEndianInt32 $bw $byteRate
  Write-LittleEndianInt16 $bw $blockAlign
  Write-LittleEndianInt16 $bw $bitsPerSample

  # data chunk
  $bw.Write([System.Text.Encoding]::ASCII.GetBytes("data"))
  Write-LittleEndianInt32 $bw $dataSize

  for ($i = 0; $i -lt $totalSamples; $i++) {
    $t = $i / [double]$SampleRate
    # mono or stereo write
    for ($ch = 0; $ch -lt $Channels; $ch++) {
      $val = & $SampleFunction $t $ch
      if ($val -is [double]) { }
      else { $val = [double]$val }
      # Sanitize non-finite values
      if ([double]::IsNaN($val) -or [double]::IsInfinity($val)) { $val = 0.0 }
      # clamp -1..1 and scale to Int16
      if ($val -gt 1.0) { $val = 1.0 }
      if ($val -lt -1.0) { $val = -1.0 }
      $s = [int]([math]::Round($val * 32767))
      Write-LittleEndianInt16 $bw $s
    }
  }

  $bw.Flush(); $bw.Dispose(); $fs.Dispose()
}

# === Sample builders ===
function Get-EngineSample([double]$baseHz = 80) {
  return { param($t, $ch)
    $w = 2 * [math]::PI
    $a = [math]::Sin($w * $baseHz * $t)
    $b = 0.3 * [math]::Sin($w * $baseHz * 2 * $t)
    $am = 0.8 + 0.2 * [math]::Sin($w * 2 * $t) # 2 Hz AM
    return 0.5 * ($a + $b) * $am
  }
}

function Get-LinearSweep([double]$f0, [double]$f1, [double]$duration) {
  # Precompute constants in the function scope to avoid relying on outer variable resolution
  if ($duration -le 0) { $duration = 1.0 } # guard against zero duration
  $k = ($f1 - $f0) / $duration
  return { param($t, $ch)
    $w = 2 * [math]::PI
    # approximate phase integral: 2π(f0*t + 0.5*k*t^2)
    $phase = $w * ($f0 * $t + 0.5 * $k * $t * $t)
    return 0.6 * [math]::Sin($phase)
  }
}

function Get-Noise([double]$amp = 0.3) { return { param($t, $ch) ($amp * (Get-Random -Minimum -1.0 -Maximum 1.0)) } }

function Get-Click([double]$freq = 300) {
  return { param($t, $ch)
    $w = 2 * [math]::PI
    $env = [math]::Exp(-20 * $t) # fast decay
    return $env * [math]::Sin($w * $freq * $t)
  }
}

function Get-Drone([double]$hz = 220) { return { param($t, $ch) 0.4 * [math]::Sin(2 * [math]::PI * $hz * $t) } }

function Get-Chord([double[]]$freqs) {
  return { param($t, $ch)
    $sum = 0.0
    foreach ($f in $freqs) { $sum += [math]::Sin(2 * [math]::PI * $f * $t) }
    return 0.25 * ($sum / $freqs.Count)
  }
}

# === File set ===
$files = @(
  @{ name = 'sfx_thruster'; file = 'sfx_thruster.wav'; sec = 3.0; ch = 1; fn = Get-EngineSample 80 },
  @{ name = 'sfx_passby'; file = 'sfx_passby.wav'; sec = 1.5; ch = 1; fn = (Get-LinearSweep 300 1200 1.5) },
  @{ name = 'ui_select'; file = 'ui_select.wav'; sec = 0.25; ch = 1; fn = (Get-Click 540) },
  @{ name = 'music_menu'; file = 'music_menu.wav'; sec = 12.0; ch = 2; fn = (Get-Chord @(261.63, 329.63, 392.00)) }, # C major
  @{ name = 'music_explore_a'; file = 'music_explore_a.wav'; sec = 15.0; ch = 2; fn = (Get-Drone 196) },
  @{ name = 'music_planet'; file = 'music_planet.wav'; sec = 15.0; ch = 2; fn = (Get-Chord @(220.00, 277.18, 329.63)) },
  @{ name = 'music_combat'; file = 'music_combat.wav'; sec = 12.0; ch = 2; fn = (Get-LinearSweep 220 660 12.0) },
  @{ name = 'music_spell_prep'; file = 'music_spell_prep.wav'; sec = 6.0; ch = 2; fn = (Get-Drone 110) },
  @{ name = 'music_landing'; file = 'music_landing.wav'; sec = 10.0; ch = 2; fn = (Get-Chord @(196.00, 246.94, 293.66)) },
  @{ name = 'voice_narrator_sample'; file = 'voice_narrator_sample.wav'; sec = 3.0; ch = 1; fn = (Get-Drone 180) },
  @{ name = 'sfx_spell_chant'; file = 'sfx_spell_chant.wav'; sec = 2.0; ch = 1; fn = (Get-Drone 155) }
)

Write-Host "Generating WAV placeholders to $resolvedOut ..."
foreach ($f in $files) {
  $path = Join-Path $resolvedOut $f.file
  New-WavFile -Path $path -DurationSec $f.sec -SampleRate $SampleRate -Channels $f.ch -SampleFunction $f.fn
  Write-Host ("  {0} -> {1} ({2}s, ch={3})" -f $f.name, $f.file, $f.sec, $f.ch)
}

Write-Host "Done. Files created under: $resolvedOut"
