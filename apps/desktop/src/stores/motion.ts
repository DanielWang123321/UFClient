// Dual-channel motion control (simulation + physical xArm): click = one step, hold = continuous, release/STOP = state 4.
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useEngineStore } from './engine'
import { useRobotStore } from './robot'
import { useRealStore } from './real'
import { RpcError } from '../rpc/client'
import type { FkResult, JogResult, RealBoundaryParam } from '../rpc/types'
import { MOTION, STATE, approach, jointVelocity, rate, stepSize, type JogTarget, type TcpAxis } from '../lib/motion'
import { checkBoundary, hasTcpBounds, violationAxis, type Boundary, type Violation } from '../lib/boundary'
import { useSettingsStore } from './settings'
import { fmt } from '../lib/units'

const IK_UNREACHABLE = 3001
const IK_NOT_CONVERGED = 3002
const JOINT_LIMIT = 3003

const MAX_DT_S = 0.5
const REAL_VEL_REFRESH_MS = 100
const REAL_VEL_DURATION_S = 0.4
const REAL_GOAL_POLL_MS = 80
const REAL_GOAL_TOL_DEG = 0.25

const TCP_AXIS_INDEX: Record<TcpAxis, number> = {
  x: 0,
  y: 1,
  z: 2,
  roll: 3,
  pitch: 4,
  yaw: 5,
}

export type MotionNotice =
  | { kind: 'boundary'; axis: string; side: 'min' | 'max'; limit: string }
  | { kind: 'limit' }
  | { kind: 'unreachable' }
  | { kind: 'align' }
  | { kind: 'raw'; message: string }

/** Format a structured motion notice using the active i18n translator. */
export function formatMotionNotice(
  n: MotionNotice,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  switch (n.kind) {
    case 'boundary':
      return t('motion.errBoundary', { axis: n.axis, side: t(`motion.${n.side}`), limit: n.limit })
    case 'limit':
      return t('motion.errLimit')
    case 'unreachable':
      return t('motion.errUnreachable')
    case 'align':
      return t('motion.errAlign')
    case 'raw':
      return n.message
  }
}

class MotionError extends Error {
  constructor(readonly notice: MotionNotice) {
    super(notice.kind === 'raw' ? notice.message : notice.kind)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export const useMotionStore = defineStore('motion', () => {
  const engine = useEngineStore()
  const robot = useRobotStore()
  const real = useRealStore()
  const settings = useSettingsStore()

  const speed = computed<number>({
    get: () => settings.speedPct,
    set: (v: number) => settings.setSpeedPct(v),
  })
  const state = ref<number>(STATE.ready)
  const active = ref<JogTarget | null>(null)
  const notice = ref<MotionNotice | null>(null)
  let token = 0

  function clearNotice() {
    notice.value = null
  }

  function boundary(): Boundary {
    const model = robot.info?.limits_deg ?? robot.q.map(() => [-360, 360] as [number, number])
    return settings.boundaryFor(robot.key, model)
  }

  function boundaryParam(): RealBoundaryParam {
    const b = boundary()
    return {
      tcp_min: [...b.tcpMin],
      tcp_max: [...b.tcpMax],
      joint_min: [...b.jointMin],
      joint_max: [...b.jointMax],
    }
  }

  function violationError(v: Violation): MotionError {
    const unit = v.kind === 'joint' ? '°' : ' mm'
    return new MotionError({
      kind: 'boundary',
      axis: violationAxis(v),
      side: v.side,
      limit: `${fmt(v.limit, 1)}${unit}`,
    })
  }

  /** Throw if moving to nextQ (and its TCP pose) leaves the safety boundary. */
  async function guard(nextQ: number[], nextTcp?: number[] | null) {
    const b = boundary()
    let tcp = nextTcp ?? null
    if (!tcp && hasTcpBounds(b)) {
      tcp = (await engine.call<FkResult>('kin.fk', { session_id: robot.sessionId, q_deg: nextQ })).tcp_pose
    }
    const v = checkBoundary(b, robot.q, nextQ, robot.fk?.tcp_pose ?? null, tcp)
    if (v) throw violationError(v)
  }

  function toNotice(e: unknown): MotionNotice {
    if (e instanceof MotionError) return e.notice
    if (e instanceof RpcError) {
      const bData = (e.data as { boundary?: Violation } | undefined)?.boundary
      if (bData && (bData.kind === 'joint' || bData.kind === 'tcp')) {
        const unit = bData.kind === 'joint' ? '°' : ' mm'
        return {
          kind: 'boundary',
          axis: violationAxis(bData),
          side: bData.side,
          limit: `${fmt(bData.limit, 1)}${unit}`,
        }
      }
      if (e.code === JOINT_LIMIT) return { kind: 'limit' }
      if (e.code === IK_UNREACHABLE || e.code === IK_NOT_CONVERGED) return { kind: 'unreachable' }
    }
    return { kind: 'raw', message: e instanceof Error ? e.message : String(e) }
  }

  /** Cancel local loops without sending an extra hardware stop (used on disconnect / controller fault). */
  function stopLocal() {
    token++
    active.value = null
    state.value = STATE.stopped
  }

  watch(
    () => [real.connected, real.errorCode] as const,
    ([conn, err], prev) => {
      const prevConn = prev?.[0] ?? false
      if ((prevConn && !conn) || (conn && err !== 0)) {
        stopLocal()
      }
    },
  )

  /** Apply one simulated increment (mm or deg, signed). Throws MotionError/RpcError when the move is impossible. */
  async function applySimDelta(t: JogTarget, delta: number) {
    if (t.kind === 'joint') {
      const i = t.index
      const want = [...robot.q]
      want[i] += delta
      const v = checkBoundary(boundary(), robot.q, want)
      if (v?.kind === 'joint') {
        const inside = v.side === 'max' ? robot.q[i] <= v.limit : robot.q[i] >= v.limit
        if (inside) {
          const onBound = [...robot.q]
          onBound[i] = v.limit
          await guard(onBound)
          void robot.setQ(onBound)
        }
        throw violationError(v)
      }
      await guard(want)
      clearNotice()
      void robot.setQ(want)
      return
    }
    const r = await engine.call<JogResult>('motion.jog_tcp', {
      session_id: robot.sessionId, q_deg: [...robot.q], axis: t.axis, delta,
    })
    await guard(r.q_deg, r.tcp_pose)
    clearNotice()
    void robot.setQ(r.q_deg)
  }

  /** Apply one physical robot step (Mode 0). */
  async function applyRealStep(t: JogTarget, delta: number) {
    const bParam = boundaryParam()
    if (t.kind === 'joint') {
      const want = [...robot.q]
      want[t.index] += delta
      await guard(want)
      clearNotice()
      await engine.call('real.step_joint', {
        index: t.index,
        delta_deg: delta,
        speed_dps: jointVelocity(speed.value),
        boundary: bParam,
      })
      return
    }
    clearNotice()
    await engine.call('real.step_tcp', {
      axis: t.axis,
      delta,
      speed_mms: rate({ kind: 'tcp', axis: 'x' }, speed.value),
      boundary: bParam,
    })
  }

  function fail(e: unknown) {
    stop()
    notice.value = toNotice(e)
  }

  /** Single click: one step (Settings > Jog, default 1 mm / 1 deg). */
  async function step(t: JogTarget, dir: 1 | -1) {
    if (!robot.sessionId) return
    if (real.connected && !real.canMove) return
    const my = ++token
    state.value = STATE.moving
    active.value = t
    const delta =
      dir *
      stepSize(t, {
        mm: settings.stepMm,
        jointDeg: settings.jointStepDeg,
        attitudeDeg: settings.attitudeStepDeg,
      })
    try {
      if (real.connected) {
        await applyRealStep(t, delta)
        if (my === token) stopLocal()
      } else {
        await applySimDelta(t, delta)
        if (my === token) stop()
      }
    } catch (e) {
      fail(e)
    }
  }

  /** Send one Mode 4 / Mode 5 velocity refresh frame to the physical robot. */
  async function sendRealVelocity(t: JogTarget, dir: 1 | -1) {
    const bParam = boundaryParam()
    const v = dir * rate(t, speed.value)
    if (t.kind === 'joint') {
      const speeds = Array(robot.info?.dof ?? real.dof ?? 6).fill(0) as number[]
      speeds[t.index] = v
      await engine.call('real.jog_joint_vel', {
        speeds_dps: speeds,
        duration_s: REAL_VEL_DURATION_S,
        boundary: bParam,
      })
      return
    }
    const speeds = [0, 0, 0, 0, 0, 0]
    speeds[TCP_AXIS_INDEX[t.axis]] = v
    await engine.call('real.jog_tcp_vel', {
      speeds,
      duration_s: REAL_VEL_DURATION_S,
      boundary: bParam,
    })
  }

  /** Press-and-hold: move continuously until stop(). */
  async function startContinuous(t: JogTarget, dir: 1 | -1) {
    if (!robot.sessionId) return
    if (real.connected && !real.canMove) return
    const my = ++token
    state.value = STATE.moving
    active.value = t

    if (real.connected) {
      clearNotice()
      while (my === token && real.connected) {
        try {
          await sendRealVelocity(t, dir)
        } catch (e) {
          if (my === token) fail(e)
          return
        }
        if (my !== token || !real.connected) break
        await sleep(REAL_VEL_REFRESH_MS)
      }
      return
    }

    let last = now()
    while (my === token) {
      await sleep(MOTION.tickMs)
      if (my !== token) break
      const tNow = now()
      const dt = Math.min(MAX_DT_S, (tNow - last) / 1000) // cap so a stalled tick never jumps far
      last = tNow
      try {
        await applySimDelta(t, dir * rate(t, speed.value) * dt)
      } catch (e) {
        if (my === token) fail(e)
        return
      }
    }
  }

  /** Interpolate all joints to a target at the joint speed (Home / Align). */
  async function moveTo(target: number[]) {
    const my = ++token
    state.value = STATE.moving
    active.value = null

    if (real.connected) {
      if (!real.canMove) {
        stopLocal()
        return
      }
      try {
        await guard(target)
        clearNotice()
        await engine.call('real.move_joints', {
          q_deg: [...target],
          speed_dps: jointVelocity(speed.value),
          boundary: boundaryParam(),
        })
      } catch (e) {
        if (my === token) fail(e)
        return
      }
      while (my === token && real.connected) {
        await sleep(REAL_GOAL_POLL_MS)
        if (my !== token || !real.connected) return
        try {
          await guard(robot.q, robot.fk?.tcp_pose ?? null)
        } catch (e) {
          if (my === token) fail(e)
          return
        }
        const err = Math.max(0, ...target.map((v, i) => Math.abs(v - (robot.q[i] ?? 0))))
        if (err <= REAL_GOAL_TOL_DEG) {
          if (my === token) stopLocal()
          return
        }
      }
      return
    }

    let last = now()
    while (my === token) {
      await sleep(MOTION.tickMs)
      if (my !== token) return
      const tNow = now()
      const dt = Math.min(MAX_DT_S, (tNow - last) / 1000)
      last = tNow
      const r = approach(robot.q, target, jointVelocity(speed.value) * dt)
      try {
        await guard(r.q)
      } catch (e) {
        if (my === token) fail(e)
        return
      }
      if (my !== token) return
      clearNotice()
      void robot.setQ(r.q)
      if (r.done) {
        if (my === token) stop()
        return
      }
    }
  }

  type GoTarget = 'home' | 'align'

  /** Joint target for Home (configured Initial Position) or Align (sidecar). Sets notice and returns null if unreachable. */
  async function resolveTarget(kind: GoTarget): Promise<number[] | null> {
    if (kind === 'home') return settings.initialPositionFor(robot.key, robot.q.length)
    try {
      const r = await engine.call<JogResult>('motion.align', { session_id: robot.sessionId, q_deg: [...robot.q] })
      return r.q_deg
    } catch (e) {
      fail(e instanceof RpcError && e.code === IK_UNREACHABLE ? new MotionError({ kind: 'align' }) : e)
      return null
    }
  }

  /** Click on Home / Align: one joint-space step (at most the angular click step per joint) toward the target, then state 4. */
  async function goStep(kind: GoTarget) {
    if (!robot.sessionId) return
    if (real.connected && !real.canMove) return
    const my = ++token
    const target = await resolveTarget(kind)
    if (!target || my !== token) return
    state.value = STATE.moving
    active.value = null
    const next = approach(robot.q, target, settings.jointStepDeg).q
    try {
      await guard(next)
      clearNotice()
      if (real.connected) {
        await engine.call('real.move_joints', {
          q_deg: next,
          speed_dps: jointVelocity(speed.value),
          boundary: boundaryParam(),
        })
        if (my === token) stopLocal()
      } else {
        await robot.setQ(next)
        if (my === token) stop()
      }
    } catch (e) {
      fail(e)
    }
  }

  /** Hold on Home / Align: move continuously toward the target at joint speed until release (stop) or arrival. */
  async function goStart(kind: GoTarget) {
    if (!robot.sessionId) return
    if (real.connected && !real.canMove) return
    const my = ++token
    const target = await resolveTarget(kind)
    if (!target || my !== token) return // released while the target was being computed
    await moveTo(target)
  }

  const home = () => goStart('home')
  const align = () => goStart('align')

  /** Release / STOP: cancel any motion, stop hardware if connected (decelerated on release, immediate on STOP), and enter state 4. */
  function stop(options: { decel?: boolean } = {}) {
    stopLocal()
    if (real.connected) {
      void real.stop(false, options.decel ?? false)
    }
  }

  return { speed, state, active, notice, clearNotice, step, startContinuous, goStep, goStart, home, align, stop, moveTo }
})
