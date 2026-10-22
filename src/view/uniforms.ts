// Uniforms shared by every view material: the clock, the wind, the sun and the night. Set once per
// frame by main.ts from simulation state.
import { Vector3 } from 'three/webgpu';
import { uniform } from 'three/tsl';

export const shared = {
  /** Seconds of simulation time (frozen in slow motion along with the world). */
  time: uniform(0),
  /** Mean wind at kite height: direction times speed, m/s. */
  wind: uniform(new Vector3(0, 0, -6)),
  /** 0 by day, 1 at full night. */
  night: uniform(0),
  /** String lights and lanterns, 0..1 through dusk. */
  lights: uniform(0),
  sunDirection: uniform(new Vector3(0, 0.4, -1)),
  /** Sun colour times intensity in scene units. */
  sunColor: uniform(new Vector3(1, 1, 1)),
  /** 0 normal, 1 when the fire-and-fireworks toggle hides fire. */
  fireOff: uniform(0),
};
