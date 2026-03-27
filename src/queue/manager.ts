import { Worker } from './worker.js';
import { getSetting } from '../db/queries/settings.js';
import { getProcessingMessages, requeueMessage } from '../db/queries/messages.js';

const DEFAULT_CONCURRENCY = 2;
const RECONCILE_INTERVAL_MS = 5000;

export class QueueManager {
  private workers: Worker[] = [];
  private _targetConcurrency: number = DEFAULT_CONCURRENCY;
  private reconcileInterval: NodeJS.Timeout | null = null;

  async start(): Promise<void> {
    console.log('[queue-manager] Starting...');

    // 1. Crash recovery: re-queue all 'processing' messages
    const processingMessages = getProcessingMessages();
    if (processingMessages.length > 0) {
      console.log(
        `[queue-manager] Crash recovery: re-queuing ${processingMessages.length} stuck message(s)`
      );
      for (const msg of processingMessages) {
        requeueMessage(msg.id);
      }
    }

    // 2. Read max_concurrent_workers from settings
    const concurrencySetting = getSetting('max_concurrent_workers');
    this._targetConcurrency = concurrencySetting
      ? parseInt(concurrencySetting, 10)
      : DEFAULT_CONCURRENCY;

    if (isNaN(this._targetConcurrency) || this._targetConcurrency < 1) {
      this._targetConcurrency = DEFAULT_CONCURRENCY;
    }

    console.log(
      `[queue-manager] Target concurrency: ${this._targetConcurrency}`
    );

    // 3. Spawn that many workers
    for (let i = 0; i < this._targetConcurrency; i++) {
      await this.spawnWorker();
    }

    // 4. Start reconcile interval
    this.reconcileInterval = setInterval(() => {
      this.reconcile().catch((error) => {
        console.error('[queue-manager] Reconcile error:', error);
      });
    }, RECONCILE_INTERVAL_MS);

    console.log(
      `[queue-manager] Started with ${this.workers.length} worker(s)`
    );
  }

  async stop(): Promise<void> {
    console.log('[queue-manager] Stopping...');

    // Clear the reconcile interval
    if (this.reconcileInterval) {
      clearInterval(this.reconcileInterval);
      this.reconcileInterval = null;
    }

    // Stop all workers gracefully in parallel
    await Promise.all(this.workers.map((worker) => worker.stop()));
    this.workers = [];

    console.log('[queue-manager] Stopped');
  }

  private async reconcile(): Promise<void> {
    // 1. Read max_concurrent_workers from settings
    const concurrencySetting = getSetting('max_concurrent_workers');
    const target = concurrencySetting
      ? parseInt(concurrencySetting, 10)
      : DEFAULT_CONCURRENCY;

    if (isNaN(target) || target < 1) {
      return;
    }

    if (target === this._targetConcurrency && this.workers.length === target) {
      return;
    }

    this._targetConcurrency = target;

    // 2. If current worker count < target, spawn more workers
    while (this.workers.length < this._targetConcurrency) {
      console.log(
        `[queue-manager] Scaling up: ${this.workers.length} -> ${this._targetConcurrency}`
      );
      await this.spawnWorker();
    }

    // 3. If current worker count > target, stop excess workers (last ones first)
    while (this.workers.length > this._targetConcurrency) {
      console.log(
        `[queue-manager] Scaling down: ${this.workers.length} -> ${this._targetConcurrency}`
      );
      await this.removeWorker();
    }
  }

  private async spawnWorker(): Promise<void> {
    // Find next available worker ID
    const existingIds = new Set(this.workers.map((w) => w.workerId));
    let nextId = 0;
    while (existingIds.has(nextId)) {
      nextId++;
    }

    const worker = new Worker(nextId);
    try {
      await worker.start();
      this.workers.push(worker);
    } catch (error) {
      console.error(
        `[queue-manager] Failed to spawn worker ${nextId}:`,
        error
      );
    }
  }

  private async removeWorker(): Promise<void> {
    const worker = this.workers.pop();
    if (worker) {
      try {
        await worker.stop();
      } catch (error) {
        console.error(
          `[queue-manager] Failed to stop worker ${worker.workerId}:`,
          error
        );
      }
    }
  }

  get activeWorkerCount(): number {
    return this.workers.length;
  }

  get maxWorkers(): number {
    return this._targetConcurrency;
  }
}
