/**
 * DEBUG HELPER - Diagnóstico sistemático del sistema de targeting
 * TEMPORAL - Para debugging de detección de asteroides
 */

import { LoggingService, LogCategory } from '../../../services/logging.service';

export class TargetingDebugger {
  private logCount = 0;
  private maxLogs = 50; // Limitar spam de logs

  constructor(private logger: LoggingService) {}

  debugStep(step: string, data: any): void {
    if (this.logCount++ < this.maxLogs) {
      this.logger.debug(LogCategory.TARGETING, `DEBUG ${step}`, data);
    }
  }

  debugCritical(step: string, data: any): void {
    this.logger.error(LogCategory.TARGETING, `CRITICAL ${step}`, data);
  }

  reset(): void {
    this.logCount = 0;
  }
}