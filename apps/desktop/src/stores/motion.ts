// Simulated motion control (no real robot): click = one step, hold = continuous, release/STOP = state 4.
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useEngineStore } from './engine'
import { useRobotStore } from './robot'
import { RpcError } from '../rpc/client'
import type { FkResult, JogResult } from '../rpc/types'
import { MOTION, STATE, approach, jointVelocity, rate, stepSize, type JogTarget } from '../lib/motion'
import { checkBoundary, hasTcpBounds, violationAxis, type Boundary, type Violation } from '../lib/boundary'
import { useSettingsStore } from './settings'
import { fmt } from '../lib/units'

const IK_UNREACHABLE = 3001
const IK_NOT_CONVERGED = 3002
const JOINT_LIMIT = 3003

const MAX_DT_S = 0.5

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
      if (e.code === JOINT_LIMIT) return { kind: 'limit' }
      if (e.code === IK_UNREACHABLE || e.code === IK_NOT_CONVERGED) return { kind: 'unreachable' }
    }
    return { kind: 'raw', message: e instanceof Error ? e.message : String(e) }
  }

  /** Apply one increment (mm or deg, signed). Throws MotionError/RpcError when the move is impossible. */
  async function applyDelta(t: JogTarget, delta: number) {
    if (t.kind === 'joint') {
      const i = t.index
      const want = [...robot.q]
      want[i] += delta
      const v = checkBoundary(boundary(), robot.q, want)
      if (v?.kind === 'joint') {
        // stop exactly on the bound if we were inside it, then report
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

  function fail(e: unknown) {
    stop()
    notice.value = toNotice(e)
  }

  /** Single click: one step (Settings > Jog, default 1 mm / 1 deg). */
  async function step(t: JogTarget, dir: 1 | -1) {
    if (!robot.sessionId) return
    const my = ++token
    state.value = STATE.moving
    active.value = t
    try {
      await applyDelta(t, dir * stepSize(t, { mm: settings.stepMm, deg: settings.stepDeg }))
      if (my === token) stop()
    } catch (e) {
      fail(e)
    }
  }

  /** Press-and-hold: move continuously until stop(). */
  async function startContinuous(t: JogTarget, dir: 1 | -1) {
    if (!robot.sessionId) return
    const my = ++token
    state.value = STATE.moving
    active.value = t
    let last = now()
    while (my === token) {
      await sleep(MOTION.tickMs)
      if (my !== token) break
      const tNow = now()
      const dt = Math.min(MAX_DT_S, (tNow - last) / 1000) // cap so a stalled tick never jumps far
      last = tNow
      try {
        await applyDelta(t, dir * rate(t, speed.value) * dt)
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

  /** Joint target for Home (all zeros) or Align (sidecar). Sets notice and returns null if unreachable. */
  async function resolveTarget(kind: GoTarget): Promise<number[] | null> {
    if (kind === 'home') return robot.q.map(() => 0)
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
    const my = ++token
    const target = await resolveTarget(kind)
    if (!target || my !== token) return
    state.value = STATE.moving
    active.value = null
    const next = approach(robot.q, target, settings.stepDeg).q
    try {
      await guard(next)
    } catch (e) {
      fail(e)
      return
    }
    clearNotice()
    await robot.setQ(next)
    if (my === token) stop()
  }

  /** Hold on Home / Align: move continuously toward the target at joint speed until release (stop) or arrival. */
  async function goStart(kind: GoTarget) {
    if (!robot.sessionId) return
    const my = ++token
    const target = await resolveTarget(kind)
    if (!target || my !== token) return // released while the target was being computed
    await moveTo(target)
  }

  const home = () => goStart('home')
  const align = () => goStart('align')

  /** Release / STOP: cancel any motion and enter state 4. */
  function stop() {
    token++
    active.value = null
    state.value = STATE.stopped
  }

  return { speed, state, active, notice, clearNotice, step, startContinuous, goStep, goStart, home, align, stop, moveTo }
})
