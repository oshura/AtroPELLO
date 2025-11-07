import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Modal } from '../../modal/modal';
import { AudioEngineService } from '../../../services/audio/audio-engine.service';

@Component({
  selector: 'app-audio-settings-dialog',
  standalone: true,
  imports: [Modal, FormsModule],
  templateUrl: './audio-settings-dialog.html',
  styleUrls: ['./audio-settings-dialog.scss']
})
export class AudioSettingsDialogComponent {
  @Input() isVisible = false;
  @Output() closed = new EventEmitter<void>();

  // UI values [0..100]
  music = 50;
  sfx = 50;
  thruster = 50;
  ambience = 50;

  constructor(private audio: AudioEngineService) {}

  ngOnInit() {
    // Initialize from engine mix if present
    try {
  const m = this.audio.getBusGain('music');
  const s = this.audio.getBusGain('sfx');
  const t = this.audio.getThrusterGain();
  const a = this.audio.getAmbienceGain?.();
      if (m !== null) this.music = Math.round(m * 100);
      if (s !== null) this.sfx = Math.round(s * 100);
      if (t !== null) this.thruster = Math.round(t * 100);
      if (typeof a === 'number') this.ambience = Math.round(a * 100);
    } catch {}
  }

  onChange() {
    const m = this.music / 100;
    const s = this.sfx / 100;
    const t = this.thruster / 100;
    const a = this.ambience / 100;
  this.audio.setBusGain('music', m);
  this.audio.setBusGain('sfx', s);
  this.audio.setThrusterGain(t);
  (this.audio as any).setAmbienceGain?.(a);
  }

  resetDefaults() {
    this.music = 50; this.sfx = 50; this.thruster = 50; this.ambience = 50;
    this.onChange();
  }

  playTestSfx() {
    try { this.audio.play('sfx_whoosh', { volume: this.sfx/100, bus: 'sfx' }); } catch {}
  }
  playTestThruster() {
  try { const h = this.audio.play('sfx_thruster', { volume: this.thruster/100, bus: 'sfx', loop: true }); setTimeout(() => h?.stop(300), 1200); } catch {}
  }

  playTestAmbience() {
    try {
      // Play a short preview on ambience bus; do not affect the always-on loop
      const vol = this.ambience / 100;
      const h = this.audio.play('sfx_logdark', { volume: vol, bus: 'ambience', loop: true });
      setTimeout(() => h?.stop(300), 1500);
    } catch {}
  }

  onCloseDialog() {
    this.isVisible = false;
    this.closed.emit();
  }
}
