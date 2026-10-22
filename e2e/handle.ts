// The test hooks the game exposes on window (src/main.ts), shared by the Playwright specs.
export interface NataiHandle {
  ready: boolean;
  advance(frames: number): void;
  simulate(seconds: number): void;
  capture(): Promise<Blob | null>;
  game: { world: { tick: number; mode: string; player: { state: string } } };
}

declare global {
  interface Window {
    __natai?: NataiHandle;
  }
}
