import { Component, Output, EventEmitter, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Modal } from '../../modal/modal';
import { GameInitializer } from '../../../services/game/game-initializer.service';
import { LoggingService, LogCategory } from '../../../services/logging.service';

@Component({
  selector: 'app-controls-dialog',
  standalone: true,
  imports: [CommonModule, Modal],
  templateUrl: './controls-dialog.html',
  styleUrl: './controls-dialog.scss'
})
export class ControlsDialogComponent implements OnChanges {
  @Input() isVisible: boolean = false;
  @Output() start = new EventEmitter<void>();

  private gameInitializer = inject(GameInitializer);
  private logger = inject(LoggingService);
  private musicStarted = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] && this.isVisible && !this.musicStarted) {
      this.tryStartMenuMusic();
    }
  }

  private async tryStartMenuMusic(): Promise<void> {
    try {
      const gameEngine = this.gameInitializer.getGameEngine();
      if (!gameEngine) return;
      
      const audio = (gameEngine as any).audio;
      const music = (gameEngine as any).music;
      
      if (audio && music) {
        audio.ensureContext();
        const unlocked = await audio.unlock();
        if (unlocked) {
          // Aumentar volumen 1.5x para el menú
          const originalGain = music.musicGain?.gain.value || 1.0;
          if (music.musicGain) {
            music.musicGain.gain.value = originalGain * 1.5;
          }
          
          await music.setScene('menu', 900);
          this.musicStarted = true;
          this.logger.info(LogCategory.AUDIO, 'Menu music started from controls dialog with 1.5x volume');
        }
      }
    } catch (e) {
      this.logger.warn(LogCategory.AUDIO, 'Could not start menu music from controls dialog', e);
    }
  }

  onStart(): void {
    this.start.emit();
  }
}
