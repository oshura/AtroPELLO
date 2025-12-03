import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../services/auth.service';

export type DeathDialogAction = 'restart' | 'respawn' | 'load';

@Component({
  selector: 'app-death-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './death-dialog.html',
  styleUrls: ['./death-dialog.scss']
})
export class DeathDialogComponent {
  @Output() action = new EventEmitter<DeathDialogAction>();
  
  public processing = false;
  public isAuthenticated = false;

  constructor(private authService: AuthService) {
    this.isAuthenticated = this.authService.isAuthenticated();
  }

  onOverlayClick(event: MouseEvent): void {
    // No permitir cerrar el diálogo clickeando fuera (muerte es obligatoria)
    event.stopPropagation();
  }

  onRestart(): void {
    if (this.processing) return;
    this.processing = true;
    this.action.emit('restart');
  }

  onRespawn(): void {
    if (this.processing) return;
    this.processing = true;
    this.action.emit('respawn');
  }

  onLoadSave(): void {
    if (this.processing) return;
    this.processing = true;
    this.action.emit('load');
  }
}
