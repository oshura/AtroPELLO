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

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']) {
      if (this.isVisible) {
        // Siempre intentar habilitar audio cuando el diálogo se muestra (idempotente)
        this.tryStartMenuMusic();
      }
    }
  }

  private async tryStartMenuMusic(): Promise<void> {
    try {
      const gameEngine = this.gameInitializer.getGameEngine();
      if (!gameEngine) return;
      
      // Call enableAudio which handles unlock, thruster init, and ambience
      // This is idempotent - safe to call multiple times
      await (gameEngine as any).enableAudio();
      
      // Then switch to menu music (enableAudio defaults to exploration)
      const music = (gameEngine as any).music;
      if (music) {
        await music.setScene('menu', 900);
        this.logger.info(LogCategory.AUDIO, 'Menu music started from controls dialog');
      }
    } catch (e) {
      this.logger.warn(LogCategory.AUDIO, 'Could not start menu music from controls dialog', e);
    }
  }

  onStart(): void {
    this.start.emit();
  }
}
