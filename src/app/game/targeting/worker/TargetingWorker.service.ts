import { Injectable } from '@angular/core';
import { LoggingService, LogCategory, LogLevel } from '../../../services/logging.service';

export interface WorkerSnapshot {
  vp: number[];
  viewport: { width: number; height: number };
  mouse: { x: number; y: number };
  positions: Float32Array;
  time: number;
  // Monotonic version to correlate results with the latest targets buffer
  targetsVersion: number;
  topK?: number;
}

export interface WorkerResult {
  type: 'result';
  indices: number[];
  distances: number[];
  hoverIndex: number | null;
  bestDistance: number | null;
  time: number;
  // Echoed from snapshot to ensure we only accept results for the latest targets set
  targetsVersion: number;
}

@Injectable({ providedIn: 'root' })
export class TargetingWorkerService {
  private worker: Worker | null = null;
  private lastResult: { data: WorkerResult; timestamp: number } | null = null;
  private isReady = false;
  private lastSnapshotVersion: number = -1;
  private logger: LoggingService | null = null; // optional (worker may init early)

  constructor(loggingService: LoggingService) {
    this.logger = loggingService;
  }

  public init(): void {
    if (this.worker || typeof Worker === 'undefined') return;
    try {
      this.worker = new Worker(new URL('./targeting.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (evt: MessageEvent<WorkerResult>) => {
        this.lastResult = { data: evt.data, timestamp: performance.now() };
        this.lastSnapshotVersion = evt.data.targetsVersion;
      };
      this.isReady = true;
      this.logger?.debug(LogCategory.TARGETING, 'Worker initialized', { ready: this.isReady });
    } catch (e) {
      this.logger?.error(LogCategory.TARGETING, 'Failed to create targeting worker', e);
      this.worker = null;
      this.isReady = false;
    }
  }

  public requestHover(snapshot: WorkerSnapshot): void {
    if (!this.worker) return;
    // Post without transferring buffer to avoid detaching it from main thread
    this.worker.postMessage(snapshot);
  }

  public getLastResult(maxAgeMs = 200): WorkerResult | null {
    if (!this.lastResult) return null;
    if (performance.now() - this.lastResult.timestamp > maxAgeMs) return null;
    return this.lastResult.data;
  }

  public ready(): boolean {
    return this.isReady && !!this.worker;
  }

  public dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.lastResult = null;
    this.isReady = false;
    this.logger?.info(LogCategory.TARGETING, 'Targeting worker disposed');
  }
}
