import { Component, EventEmitter, Input, Output, HostListener, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Modal } from '../../modal/modal';
import { AudioEngineService } from '../../../services/audio/audio-engine.service';
import { MusicDirectorService } from '../../../services/audio/music-director.service';
import { KeyBindingsService } from '../../../services/key-bindings.service';
import { AuthService } from '../../../services/auth.service';
import { CloudSavesPanelComponent } from '../../../libs/cloud-saves/cloud-saves-panel.component';

@Component({
  selector: 'app-audio-settings-dialog',
  standalone: true,
  imports: [CommonModule, Modal, FormsModule, CloudSavesPanelComponent],
  templateUrl: './audio-settings-dialog.html',
  styleUrls: ['./audio-settings-dialog.scss']
})
export class AudioSettingsDialogComponent implements OnChanges {
  @Input() isVisible = false;
  private requestedStartTab: 'audio' | 'controls' | 'saves' | null = null;

  @Input()
  set startTab(value: 'audio' | 'controls' | 'saves' | null) {
    this.requestedStartTab = value;
    if (value) {
      this.applyExternalTab(value);
    }
  }

  get startTab(): 'audio' | 'controls' | 'saves' | null {
    return this.requestedStartTab;
  }

  @Output() closed = new EventEmitter<void>();

  // UI values [0..100]
  music = 50;
  sfx = 50;
  thruster = 50;
  ambience = 50;
  master = 100;
  activeTab: 'audio' | 'controls' | 'saves' = 'audio';
  bindings: Array<{ action: string; key: string }> = [];
  bindingColumns: Array<{ base: number; items: Array<{ action: string; key: string }> }> = [];
  rebindingAction: string | null = null; // which action is being rebound
  private previewHandles: Record<string, any> = {};
  private pausedMusic = false;
  private pausedAmbience = false;

  constructor(
    private audio: AudioEngineService,
    private keyBindings: KeyBindingsService,
    private musicDirector: MusicDirectorService,
    protected auth: AuthService
  ) {}

  ngOnInit() {
    // Initialize from engine mix if present
    try {
      // Apply new defaults irrespective of previous stored bus values:
      // music starts at 30, sfx at 80, thruster at 50, ambience at 50 (mapped 50->old 100), master at 100
      this.music = 30;
      this.sfx = 80;
      this.thruster = 50;
      this.ambience = 50;
  this.master = 50; // 50% = unidad (1.0) con el nuevo mapeo del master
      this.onChange();
    } catch {}
    // Initialize bindings list from shared service (DI)
    this.bindings = this.keyBindings.getAll();
    this.rebuildBindingColumns();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isVisible']) {
      const now = changes['isVisible'].currentValue as boolean;
      if (now) {
        if (this.activeTab === 'saves' && !this.auth.authenticated()) {
          this.activeTab = 'audio';
        }
        if (this.requestedStartTab) {
          this.applyExternalTab(this.requestedStartTab);
        }
        // Dialog opened: pause ambient loop and music to allow accurate previews
  try { this.musicDirector.stop(300); this.pausedMusic = true; } catch {}
        try { this.audio.stopAmbientLoop(200); this.pausedAmbience = true; } catch {}
      } else {
        // Dialog closed: stop any previews and restore scene/ambience
        this.stopAllPreviews();
        try { if (this.pausedAmbience) { this.audio.startAmbientLoop(); } } catch {}
  try { if (this.pausedMusic) { this.musicDirector.setScene('exploration', 800); } } catch {}
        this.pausedMusic = false;
        this.pausedAmbience = false;
      }
    }
  }

  onChange() {
    const m = this.music / 100;
    const s = this.sfx / 100;
    const t = this.thruster / 100;
    const a = this.ambience / 100;
  // Master remap: 50% = 1.0 (unidad), 100% = 2.0 (doble)
  const masterGain = (this.master / 100) * 2;
  this.audio.setBusGain('music', m);
  // SFX remap: 80 -> old 100; 100 -> 1.25x old max
  const SFX_SCALE = 1.25;
  const sfxBus = Math.min(SFX_SCALE, Math.max(0, s * SFX_SCALE));
  this.audio.setBusGain('sfx', sfxBus);
  this.audio.setThrusterGain(t);
  (this.audio as any).setAmbienceGain?.(a);
  (this.audio as any).setMasterGain?.(masterGain);
    // Keep any active previews in sync with current slider values
    this.updatePreviewVolumes();
  }

  resetDefaults() {
    this.music = 30; this.sfx = 80; this.thruster = 50; this.ambience = 50; this.master = 50; // 50 = unidad
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

  // --- New: Per-slider Play/Stop preview toggles ---
  isPreviewing(kind: 'music'|'sfx'|'thruster'|'ambience'): boolean { return !!this.previewHandles[kind]; }
  togglePreview(kind: 'music'|'sfx'|'thruster'|'ambience') {
    const current = this.previewHandles[kind];
    if (current) {
      // Stop immediately to keep UI icon and audio in sync
      try { current.stop?.(0); } catch {}
      delete this.previewHandles[kind];
      return;
    }
    let name = 'sfx_whoosh';
    let bus: any = 'sfx';
    let vol = 0.5;
  if (kind === 'music') { bus = 'music'; name = 'music_explore_a'; vol = 0.6; }
    if (kind === 'sfx') { bus = 'sfx'; name = 'sfx_whoosh'; vol = this.sfx/100; }
    if (kind === 'thruster') { bus = 'sfx'; name = 'sfx_thruster'; vol = this.thruster/100; }
  if (kind === 'ambience') { bus = 'ambience'; name = 'sfx_logdark'; const eff = Math.max(0, Math.min(2, (this.ambience/100) * 2)); vol = 0.1 * eff; }
    try {
      const h = this.audio.play(name, { loop: true, volume: vol, bus });
      if (h) {
        this.previewHandles[kind] = h;
      }
    } catch {}
  }
  private stopAllPreviews() {
    for (const k of Object.keys(this.previewHandles)) {
      try { this.previewHandles[k]?.stop?.(0); } catch {}
      delete this.previewHandles[k];
    }
  }

  // Cancel current rebinding if clicking outside any key input
  onControlsMouseDown(ev: MouseEvent) {
    if (this.activeTab !== 'controls' || this.rebindingAction === null) return;
    const target = ev.target as HTMLElement;
    if (!target.closest('.key-input')) {
      // Cancel without applying
      this.rebindingAction = null;
    }
  }
  private updatePreviewVolumes() {
    try { if (this.previewHandles['music']) this.previewHandles['music'].setVolume(0.6); } catch {}
    try { if (this.previewHandles['sfx']) this.previewHandles['sfx'].setVolume(this.sfx/100); } catch {}
    try { if (this.previewHandles['thruster']) this.previewHandles['thruster'].setVolume(this.thruster/100); } catch {}
    try { if (this.previewHandles['ambience']) { const eff = Math.max(0, Math.min(2, (this.ambience/100) * 2)); this.previewHandles['ambience'].setVolume(0.1 * eff); } } catch {}
  }

  // --- Controls tab handlers ---
  startRebind(action: string) {
    this.rebindingAction = action;
  }
  clearBinding(index: number | string) {
    const action = typeof index === 'number' ? this.bindings[index].action : index;
    this.keyBindings.set(action as any, '');
    this.bindings = this.keyBindings.getAll();
    this.rebuildBindingColumns();
  }

  @HostListener('document:keydown', ['$event'])
  onKeyCapture(e: KeyboardEvent) {
    if (this.activeTab !== 'controls' || this.rebindingAction === null) return;
    // While rebinding, consume the event so it doesn't reach the modal (Esc shouldn't close the dialog)
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { this.rebindingAction = null; return; }
    const key = this.keyBindings.fromEvent(e);
    this.keyBindings.set(this.rebindingAction as any, key);
    this.bindings = this.keyBindings.getAll();
    this.rebuildBindingColumns();
    this.rebindingAction = null;
  }

  onCloseDialog() {
    this.isVisible = false;
    this.closed.emit();
  }

  // Reset only current tab to defaults
  onResetToDefault() {
    if (this.activeTab === 'audio') {
      // game initial defaults
      this.music = 30;
      this.sfx = 80;
      this.thruster = 50;
      this.ambience = 50;
      this.master = 50; // 50% = 1x
      this.onChange();
    } else if (this.activeTab === 'controls') {
      (this.keyBindings as any).resetToDefaults?.();
      this.bindings = this.keyBindings.getAll();
      this.rebuildBindingColumns();
    }
  }

  protected selectTab(tab: 'audio' | 'controls' | 'saves') {
    if (tab === 'saves' && !this.auth.authenticated()) {
      return;
    }
    this.activeTab = tab;
    this.requestedStartTab = tab;
  }

  private rebuildBindingColumns() {
    // Exclude non-configurable actions
    const configurable = this.bindings.filter(b => !['stats_overlay','start_resume','clear_target','resume'].includes(b.action));
    const total = configurable.length;
    const perCol = Math.ceil(total / 3);
    const c1 = configurable.slice(0, perCol);
    const c2 = configurable.slice(perCol, perCol*2);
    const c3 = configurable.slice(perCol*2);
    this.bindingColumns = [
      { base: 0, items: c1 },
      { base: perCol, items: c2 },
      { base: perCol*2, items: c3 }
    ].filter(col => col.items.length > 0);
  }

  private applyExternalTab(tab: 'audio' | 'controls' | 'saves'): void {
    if (tab === 'saves' && !this.auth.authenticated()) {
      this.activeTab = 'audio';
      return;
    }
    this.activeTab = tab;
  }
}
