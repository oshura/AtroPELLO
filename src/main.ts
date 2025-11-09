import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { GameLogger } from './app/game/utils/GameLogger';
import { LogCategory } from './app/services/logging.service';

bootstrapApplication(App, appConfig)
  .catch((err) => GameLogger.error(LogCategory.GAME_INITIALIZATION, 'Bootstrap error', err));
