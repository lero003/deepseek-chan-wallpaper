export interface PlaybackConditions {
  ready: boolean;
  paused: boolean;
  hidden: boolean;
  suspended: boolean;
  reducedMotion: boolean;
  still: boolean;
  dialogOpen: boolean;
}

export function shouldAnimate(conditions: Readonly<PlaybackConditions>): boolean {
  return conditions.ready && !conditions.paused && !conditions.hidden && !conditions.suspended
    && !conditions.reducedMotion && !conditions.still && !conditions.dialogOpen;
}

/** A resize needs one still paint even in a hidden tab; it must not start a timer. */
export function shouldPaintFrame(conditions: Readonly<Pick<PlaybackConditions, 'hidden' | 'suspended'>>, reason: 'animation' | 'resize'): boolean {
  return !conditions.suspended && (reason === 'resize' || !conditions.hidden);
}

/** Both explicit resume and an unreported sleep gap discard elapsed wall time. */
export class FrameClock {
  private previous: number | null = null;
  reset(): void { this.previous = null; }
  sample(timestampMs: number): number {
    if (!Number.isFinite(timestampMs)) { this.reset(); return 0; }
    const previous = this.previous;
    this.previous = timestampMs;
    if (previous === null) return 0;
    const elapsed = timestampMs - previous;
    return elapsed > 0 && elapsed <= 250 ? elapsed / 1000 : 0;
  }
}

export interface Scheduler {
  now(): number;
  request(callback: () => void, delayMs: number): number;
  cancel(handle: number): void;
}

/** One pending timer at most; no 60Hz RAF wake-ups to produce a 15/30Hz scene. */
export class AnimationLoop {
  private readonly clock = new FrameClock();
  private handle: number | null = null;
  private active = false;
  private fps: 15 | 30 = 30;
  private deadline = 0;
  private scheduler: Scheduler;
  private frame: (deltaSeconds: number) => void;
  constructor(scheduler: Scheduler, frame: (deltaSeconds: number) => void) {
    this.scheduler = scheduler;
    this.frame = frame;
  }
  setFrameRate(fps: 15 | 30): void {
    if (this.fps === fps) return;
    this.fps = fps;
    if (this.active) { this.stop(); this.start(); }
  }
  setRunning(running: boolean): void {
    if (running) this.start(); else this.stop();
  }
  private start(): void {
    if (this.active) return;
    this.active = true;
    this.clock.reset();
    const now = this.scheduler.now();
    this.clock.sample(now);
    this.frame(0);
    this.deadline = now + 1000 / this.fps;
    this.schedule();
  }
  private schedule(): void {
    this.handle = this.scheduler.request(() => this.tick(), Math.max(1, this.deadline - this.scheduler.now()));
  }
  private tick(): void {
    this.handle = null;
    if (!this.active) return;
    const now = this.scheduler.now();
    this.frame(this.clock.sample(now));
    if (!this.active) return;
    // Never catch up a backlog of render callbacks after a delayed timer.
    this.deadline = Math.max(this.deadline + 1000 / this.fps, now + 1000 / this.fps);
    this.schedule();
  }
  private stop(): void {
    this.active = false;
    if (this.handle !== null) this.scheduler.cancel(this.handle);
    this.handle = null;
    this.clock.reset();
  }
  dispose(): void { this.stop(); }
}
