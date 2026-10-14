import type { TmuxScrollClientResult, TmuxScrollDirection } from '@shared/types';

interface HostScrollControllerOptions {
  scroll: (direction: TmuxScrollDirection, amount?: number) => Promise<TmuxScrollClientResult>;
  onStateChange: (inMode: boolean) => void;
}

export class XtermHostScrollController {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private generation = 0;
  private needsExit = false;
  private disposed = false;
  inMode = false;

  constructor(private readonly options: HostScrollControllerOptions) {}

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    this.pending += 1;
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => {
        this.pending -= 1;
      },
      () => {
        this.pending -= 1;
      }
    );
    return result;
  }

  private updateState(result: TmuxScrollClientResult): void {
    if (typeof result.inMode !== 'boolean') return;
    this.needsExit = result.inMode;
    this.inMode = result.inMode;
    if (!this.disposed) this.options.onStateChange(result.inMode);
  }

  cancelQueuedScroll(): void {
    this.generation += 1;
  }

  scroll(direction: 'up' | 'down', amount: number): Promise<TmuxScrollClientResult | undefined> {
    const generation = this.generation;
    return this.enqueue(async () => {
      if (this.disposed || generation !== this.generation) return undefined;
      // A transport failure can leave copy mode active even without an acknowledgement.
      this.needsExit = true;
      const result = await this.options.scroll(direction, amount);
      this.updateState(result);
      return generation === this.generation && !this.disposed ? result : undefined;
    });
  }

  returnToLive(write?: () => void, force = false): Promise<void> {
    this.cancelQueuedScroll();
    if (!force && !this.needsExit && this.pending === 0) {
      if (!this.disposed) write?.();
      return Promise.resolve();
    }
    return this.enqueue(async () => {
      if (this.disposed) return;
      if (force || this.needsExit) {
        this.needsExit = true;
        const result = await this.options.scroll('bottom');
        this.updateState(result);
        if (result.inMode !== false) {
          throw new Error('Could not confirm tmux copy mode exit');
        }
      }
      if (!this.disposed) write?.();
    });
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.cancelQueuedScroll();
    return this.enqueue(async () => {
      if (!this.needsExit) return;
      const result = await this.options.scroll('bottom');
      this.updateState(result);
    });
  }
}
