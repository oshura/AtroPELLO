/**
 * DEBUG HELPER - Diagnóstico sistemático del sistema de targeting
 * TEMPORAL - Para debugging de detección de asteroides
 */

export class TargetingDebugger {
  private static logCount = 0;
  private static maxLogs = 50; // Limitar spam de logs
  
  static debugStep(step: string, data: any): void {
    if (this.logCount++ < this.maxLogs) {
      console.log(`🔍 DEBUG [${step}]:`, data);
    }
  }
  
  static debugCritical(step: string, data: any): void {
    console.log(`🚨 CRITICAL [${step}]:`, data);
  }
  
  static reset(): void {
    this.logCount = 0;
  }
}