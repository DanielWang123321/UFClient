// Motion control settings and pure helpers (simulation only).
// Long-press threshold and continuous speed mapping match ufactory_robot_viewer;
// click steps and safety boundaries remain user-configurable in Settings.

export const MOTION = {
  /** Default click step on a linear TCP axis (mm); user-configurable in Settings > Jog. */
  stepMm: 1,
  /** Default click step on a rotation axis or a joint (deg); user-configurable in Settings > Jog. */
  stepDeg: 1,
  /** Valid range of the configurable click steps. */
  stepMmRange: [0.01, 100] as [number, number],
  stepDegRange: [0.01, 45] as [number, number],
  /** Holding a button longer than this switches to continuous motion (ms). */
  longPressMs: 220,
  /** Linear TCP speed range for 1%–100% (mm/s). */
  minLinearMmS: 2.3,
  maxLinearMmS: 230,
  /** Minimum angular speed at 1% (deg/s). */
  minAngularDegS: 1,
  /** TCP orientation speed at 100% (deg/s). */
  maxTcpAngularDegS: 40,
  /** Joint speed at 100% (deg/s). */
  maxJointDegS: 45,
  /** Default speed slider position (%). */
  defaultSpeedPct: 50,
  /** Continuous-motion update period (ms). */
  tickMs: 40,
} as const

/** xArm-style simulated controller states. */
export const STATE = { moving: 1, ready: 2, stopped: 4 } as const

export type TcpAxis = 'x' | 'y' | 'z' | 'roll' | 'pitch' | 'yaw'
export type JogTarget = { kind: 'joint'; index: number } | { kind: 'tcp'; axis: TcpAxis }

export function isLinear(t: JogTarget): boolean {
  return t.kind === 'tcp' && (t.axis === 'x' || t.axis === 'y' || t.axis === 'z')
}

export interface Steps { mm: number; deg: number }

/** Single-click increment (mm or deg). */
export function stepSize(t: JogTarget, steps: Steps = { mm: MOTION.stepMm, deg: MOTION.stepDeg }): number {
  return isLinear(t) ? steps.mm : steps.deg
}

/** Validate a configured step; returns the fallback for invalid input and clamps into range. */
export function sanitizeStep(v: unknown, range: [number, number], fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(range[1], Math.max(range[0], n))
}

/** Validate persisted speed percentage (integer 1–100); returns fallback otherwise. */
export function sanitizeSpeedPct(v: unknown, fallback: number = MOTION.defaultSpeedPct): number {
  if (typeof v === 'string' && v.trim() === '') return fallback
  if (typeof v !== 'number' && typeof v !== 'string') return fallback
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 100) return fallback
  return n
}

/** Joint & preset (Home/Align) continuous angular velocity (1–45 deg/s). */
export function jointVelocity(speedPct: number): number {
  const p = Math.min(100, Math.max(1, Math.round(speedPct)))
  return MOTION.minAngularDegS + ((p - 1) * (MOTION.maxJointDegS - MOTION.minAngularDegS)) / 99
}

/** Continuous rate (mm/s or deg/s) at a speed percentage (1%–100%). */
export function rate(t: JogTarget, speedPct: number): number {
  const p = Math.min(100, Math.max(1, Math.round(speedPct)))
  if (t.kind === 'joint') return jointVelocity(p)
  if (isLinear(t)) return p * MOTION.minLinearMmS
  return MOTION.minAngularDegS + ((p - 1) * (MOTION.maxTcpAngularDegS - MOTION.minAngularDegS)) / 99
}

/** Cartesian axes unavailable for a given robot DOF (xArm 5 cannot jog Roll independently). */
export function disabledTcpAxes(dof: number): TcpAxis[] {
  return dof === 5 ? ['roll'] : []
}

/** Compute zero-centered bidirectional progress geometry (%) for a joint meter. */
export function jointProgress(valueDeg: number, lo: number, hi: number): {
  zeroPct: number
  currentPct: number
  fillLeft: number
  fillWidth: number
} {
  const span = hi - lo
  const frac = (v: number) => (span > 0 ? Math.min(100, Math.max(0, ((v - lo) / span) * 100)) : 50)
  const zeroPct = frac(0)
  const currentPct = frac(valueDeg)
  return {
    zeroPct,
    currentPct,
    fillLeft: Math.min(zeroPct, currentPct),
    fillWidth: Math.abs(currentPct - zeroPct),
  }
}

/** Move joint i by delta, clamped to [lo, hi]. hitLimit is true when the clamp kicked in. */
export function stepJoint(q: number[], i: number, delta: number, limits: [number, number][]): { q: number[]; hitLimit: boolean } {
  const [lo, hi] = limits[i] ?? [-Infinity, Infinity]
  const want = q[i] + delta
  const next = [...q]
  next[i] = Math.min(hi, Math.max(lo, want))
  return { q: next, hitLimit: want > hi + 1e-9 || want < lo - 1e-9 }
}

/** One interpolation step from q towards target at maxStep deg per joint; done when reached. */
export function approach(q: number[], target: number[], maxStep: number): { q: number[]; done: boolean } {
  const diff = target.map((t, i) => t - q[i])
  const far = Math.max(0, ...diff.map(Math.abs))
  if (far <= maxStep) return { q: [...target], done: true }
  const k = maxStep / far // move all joints proportionally so they arrive together
  return { q: q.map((v, i) => v + diff[i] * k), done: false }
}

/**
 * Click vs. press-and-hold detector. Short press -> onClick on release;
 * press longer than longPressMs -> onHoldStart, then onHoldEnd on release.
 */
export class PressHold {
  private timer: ReturnType<typeof setTimeout> | null = null
  private holding = false
  private down = false
  constructor(
    private cb: { onClick: () => void; onHoldStart: () => void; onHoldEnd: () => void },
    private ms: number = MOTION.longPressMs,
  ) {}
  press() {
    if (this.down) return
    this.down = true
    this.holding = false
    this.timer = setTimeout(() => {
      this.timer = null
      this.holding = true
      this.cb.onHoldStart()
    }, this.ms)
  }
  release() {
    if (!this.down) return
    this.down = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
      this.cb.onClick()
    } else if (this.holding) {
      this.holding = false
      this.cb.onHoldEnd()
    }
  }
  /** Pointer left / cancelled: never counts as a click. */
  cancel() {
    if (!this.down) return
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
      this.down = false
      return
    }
    this.release()
  }
  /** External stop: clear state and pending timer without firing callbacks. */
  abort() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.down = false
    this.holding = false
  }
  isActive(): boolean {
    return this.down
  }
}
