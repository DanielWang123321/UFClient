// User settings (Settings page, persisted jog steps/presets/mounting & default real-robot IP), persisted to localStorage.
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { MOTION, sanitizeSpeedPct, sanitizeStep } from '../lib/motion'
import { normalizeBoundary, type Boundary } from '../lib/boundary'
import {
  MOUNTING_PRESETS,
  clampRotateDeg,
  clampTiltDeg,
  matchMountingPreset,
  sanitizeMounting,
  type MountingConfig,
  type MountingPresetId,
} from '../lib/mounting'
import type { RealStatus } from '../rpc/types'

export const SETTINGS_KEY = 'ugclient.settings'
export const DEFAULT_REAL_IP = '192.168.1.60'
export const REAL_DEFAULT_SPEED_PCT = 20
export const DEFAULT_ROBOT = 'xarm6_1305'

export type Pose6Tuple = [number, number, number, number, number, number]

export interface TcpPreset {
  id: string
  name: string
  massKg: number
  comMm: [number, number, number]
  offset: Pose6Tuple
}

export interface CoordPreset {
  id: string
  name: string
  offset: Pose6Tuple
}

export interface SessionConfig {
  robot: string
  endEffector: string
  tcpOffset: number[]
  payload: { mass_kg: number; com_mm: number[] }
  q: number[]
}

interface Stored {
  stepMm?: number
  stepDeg?: number
  jointStepDeg?: number
  attitudeStepDeg?: number
  collisionSensitivity?: number
  initialPositions?: Record<string, number[]>
  tcpPresets?: TcpPreset[]
  worldOffset?: Pose6Tuple
  coordPresets?: CoordPreset[]
  mounting?: Partial<MountingConfig>
  speedPct?: number
  boundaries?: Record<string, Partial<Boundary>>
  defaultRobot?: string
  restoreSession?: boolean
  session?: SessionConfig | null
  realIp?: string
}

const ZERO_POSE6: Pose6Tuple = [0, 0, 0, 0, 0, 0]

function read(): Stored {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Stored
  } catch {
    return {}
  }
}

function sanitizeIp(v: unknown, fallback = DEFAULT_REAL_IP): string {
  if (typeof v !== 'string') return fallback
  const trimmed = v.trim()
  return trimmed && !/\s/.test(trimmed) ? trimmed : fallback
}

function sanitizeSensitivity(v: unknown, fallback = 3): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(5, Math.max(0, Math.round(n)))
}

function sanitizePose6(raw: unknown, fallback: Pose6Tuple = ZERO_POSE6): Pose6Tuple {
  if (!Array.isArray(raw) || raw.length !== 6) return [...fallback]
  const nums = raw.map((x) => Number(x))
  if (nums.some((x) => !Number.isFinite(x))) return [...fallback]
  return nums as Pose6Tuple
}

function sanitizeCom3(raw: unknown): [number, number, number] {
  if (!Array.isArray(raw) || raw.length !== 3) return [0, 0, 0]
  const nums = raw.map((x) => Number(x))
  if (nums.some((x) => !Number.isFinite(x))) return [0, 0, 0]
  return nums as [number, number, number]
}

function sanitizeInitialPositions(raw: unknown): Record<string, number[]> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number[]> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(v) && v.length > 0) {
      const nums = v.map((x) => Number(x))
      if (nums.every((x) => Number.isFinite(x))) out[k] = nums
    }
  }
  return out
}

function sanitizeTcpPresets(raw: unknown): TcpPreset[] {
  if (!Array.isArray(raw)) return []
  const out: TcpPreset[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Partial<TcpPreset>
    if (typeof obj.name !== 'string' || !obj.name.trim()) continue
    const mass = Number(obj.massKg)
    out.push({
      id: typeof obj.id === 'string' && obj.id ? obj.id : makePresetId(),
      name: obj.name.trim(),
      massKg: Number.isFinite(mass) && mass >= 0 ? mass : 0,
      comMm: sanitizeCom3(obj.comMm),
      offset: sanitizePose6(obj.offset),
    })
  }
  return out
}

function sanitizeCoordPresets(raw: unknown): CoordPreset[] {
  if (!Array.isArray(raw)) return []
  const out: CoordPreset[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const obj = item as Partial<CoordPreset>
    if (typeof obj.name !== 'string' || !obj.name.trim()) continue
    out.push({
      id: typeof obj.id === 'string' && obj.id ? obj.id : makePresetId(),
      name: obj.name.trim(),
      offset: sanitizePose6(obj.offset),
    })
  }
  return out
}

function vecChanged(a: number[], b: number[], eps = 1e-4): boolean {
  if (a.length !== b.length) return true
  return a.some((v, i) => Math.abs(v - (b[i] ?? 0)) > eps)
}

function makePresetId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export const useSettingsStore = defineStore('settings', () => {
  const s = read()
  const stepMm = ref(sanitizeStep(s.stepMm, MOTION.stepMmRange, MOTION.stepMm))
  const jointStepDeg = ref(sanitizeStep(s.jointStepDeg ?? s.stepDeg, MOTION.stepDegRange, MOTION.stepDeg))
  const attitudeStepDeg = ref(sanitizeStep(s.attitudeStepDeg ?? s.stepDeg, MOTION.stepDegRange, MOTION.stepDeg))
  const stepDeg = computed(() => jointStepDeg.value)
  const collisionSensitivity = ref(sanitizeSensitivity(s.collisionSensitivity, 3))
  const initialPositions = ref<Record<string, number[]>>(sanitizeInitialPositions(s.initialPositions))
  const tcpPresets = ref<TcpPreset[]>(sanitizeTcpPresets(s.tcpPresets))
  const worldOffset = ref<Pose6Tuple>(sanitizePose6(s.worldOffset))
  const coordPresets = ref<CoordPreset[]>(sanitizeCoordPresets(s.coordPresets))
  const mounting = ref<MountingConfig>(sanitizeMounting(s.mounting))
  const speedPct = ref(sanitizeSpeedPct(s.speedPct, MOTION.defaultSpeedPct))
  const boundaries = ref<Record<string, Partial<Boundary>>>(s.boundaries ?? {})
  const defaultRobot = ref(s.defaultRobot ?? DEFAULT_ROBOT)
  const restoreSession = ref(s.restoreSession ?? false)
  const session = ref<SessionConfig | null>(s.session ?? null)
  const realIp = ref(sanitizeIp(s.realIp, DEFAULT_REAL_IP))

  function save() {
    const data: Stored = {
      stepMm: stepMm.value,
      stepDeg: jointStepDeg.value,
      jointStepDeg: jointStepDeg.value,
      attitudeStepDeg: attitudeStepDeg.value,
      collisionSensitivity: collisionSensitivity.value,
      initialPositions: initialPositions.value,
      tcpPresets: tcpPresets.value,
      worldOffset: worldOffset.value,
      coordPresets: coordPresets.value,
      mounting: mounting.value,
      speedPct: speedPct.value,
      boundaries: boundaries.value,
      defaultRobot: defaultRobot.value,
      restoreSession: restoreSession.value,
      session: session.value,
      realIp: realIp.value,
    }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data))
    } catch {
      /* keep UI functional when localStorage is unavailable */
    }
  }
  watch(
    [
      stepMm,
      jointStepDeg,
      attitudeStepDeg,
      collisionSensitivity,
      initialPositions,
      tcpPresets,
      worldOffset,
      coordPresets,
      mounting,
      speedPct,
      boundaries,
      defaultRobot,
      restoreSession,
      session,
      realIp,
    ],
    save,
    { deep: true },
  )

  function setStepMm(v: unknown) {
    stepMm.value = sanitizeStep(v, MOTION.stepMmRange, stepMm.value)
  }
  function setJointStepDeg(v: unknown) {
    jointStepDeg.value = sanitizeStep(v, MOTION.stepDegRange, jointStepDeg.value)
  }
  function setAttitudeStepDeg(v: unknown) {
    attitudeStepDeg.value = sanitizeStep(v, MOTION.stepDegRange, attitudeStepDeg.value)
  }
  function setStepDeg(v: unknown) {
    setJointStepDeg(v)
    setAttitudeStepDeg(v)
  }
  function setCollisionSensitivity(v: unknown) {
    collisionSensitivity.value = sanitizeSensitivity(v, collisionSensitivity.value)
  }
  function setSpeedPct(v: unknown) {
    const n = Number(v)
    if (Number.isFinite(n)) speedPct.value = Math.min(100, Math.max(1, Math.round(n)))
  }
  function setRealIp(v: unknown) {
    realIp.value = sanitizeIp(v, realIp.value)
  }

  function initialPositionFor(key: string, dof: number): number[] {
    if (dof <= 0) return []
    const saved = initialPositions.value[key]
    if (Array.isArray(saved) && saved.length === dof && saved.every((x) => Number.isFinite(x))) {
      return [...saved]
    }
    return Array(dof).fill(0)
  }
  function setInitialPosition(key: string, qDeg: number[]) {
    if (!key || !Array.isArray(qDeg) || qDeg.length === 0) return
    const clean = qDeg.map((x) => Number(x))
    if (clean.some((x) => !Number.isFinite(x))) return
    const cur = initialPositions.value[key]
    if (cur && !vecChanged(cur, clean)) return
    initialPositions.value = { ...initialPositions.value, [key]: clean }
  }
  function resetInitialPosition(key: string) {
    if (!(key in initialPositions.value)) return
    const next = { ...initialPositions.value }
    delete next[key]
    initialPositions.value = next
  }

  function addTcpPreset(preset: Omit<TcpPreset, 'id'>): TcpPreset {
    const entry: TcpPreset = {
      id: makePresetId(),
      name: preset.name.trim() || 'Preset',
      massKg: Math.max(0, Number.isFinite(preset.massKg) ? preset.massKg : 0),
      comMm: sanitizeCom3(preset.comMm),
      offset: sanitizePose6(preset.offset),
    }
    tcpPresets.value = [...tcpPresets.value, entry]
    return entry
  }
  function removeTcpPreset(id: string) {
    tcpPresets.value = tcpPresets.value.filter((p) => p.id !== id)
  }

  function setWorldOffset(offset: number[]) {
    const next = sanitizePose6(offset, worldOffset.value)
    if (!vecChanged(worldOffset.value, next)) return
    worldOffset.value = next
  }
  function addCoordPreset(preset: Omit<CoordPreset, 'id'>): CoordPreset {
    const entry: CoordPreset = {
      id: makePresetId(),
      name: preset.name.trim() || 'Coordinate',
      offset: sanitizePose6(preset.offset),
    }
    coordPresets.value = [...coordPresets.value, entry]
    return entry
  }
  function removeCoordPreset(id: string) {
    coordPresets.value = coordPresets.value.filter((p) => p.id !== id)
  }

  function setMountingPreset(preset: MountingPresetId) {
    if (preset === 'custom') {
      if (mounting.value.preset !== 'custom') {
        mounting.value = { ...mounting.value, preset: 'custom' }
      }
      return
    }
    const found = MOUNTING_PRESETS.find((p) => p.id === preset)
    if (!found) return
    if (
      mounting.value.preset === found.id &&
      Math.abs(mounting.value.tiltDeg - found.tiltDeg) <= 1e-4 &&
      Math.abs(mounting.value.rotateDeg - found.rotateDeg) <= 1e-4
    ) {
      return
    }
    mounting.value = { preset: found.id, tiltDeg: found.tiltDeg, rotateDeg: found.rotateDeg }
  }
  function setMountingAngles(tiltDeg: number, rotateDeg: number, keepCustom = false) {
    const tilt = clampTiltDeg(tiltDeg, mounting.value.tiltDeg)
    const rot = clampRotateDeg(rotateDeg, mounting.value.rotateDeg)
    const preset: MountingPresetId = keepCustom ? 'custom' : matchMountingPreset(tilt, rot)
    if (
      mounting.value.preset === preset &&
      Math.abs(mounting.value.tiltDeg - tilt) <= 1e-4 &&
      Math.abs(mounting.value.rotateDeg - rot) <= 1e-4
    ) {
      return
    }
    mounting.value = { preset, tiltDeg: tilt, rotateDeg: rot }
  }

  /** Strictly overwrite local controller-owned settings from a real robot snapshot. */
  function applyFromRealController(robotKey: string, dof: number, snap: RealStatus) {
    if (typeof snap.collision_sensitivity === 'number' && Number.isFinite(snap.collision_sensitivity)) {
      const next = sanitizeSensitivity(snap.collision_sensitivity, collisionSensitivity.value)
      if (next !== collisionSensitivity.value) collisionSensitivity.value = next
    }
    if (
      Array.isArray(snap.world_offset) &&
      snap.world_offset.length === 6 &&
      snap.world_offset.every((x) => typeof x === 'number' && Number.isFinite(x))
    ) {
      setWorldOffset(snap.world_offset)
    }
    if (
      Array.isArray(snap.mount_direction) &&
      snap.mount_direction.length >= 2 &&
      snap.mount_direction.slice(0, 2).every((x) => typeof x === 'number' && Number.isFinite(x))
    ) {
      setMountingAngles(snap.mount_direction[0], snap.mount_direction[1], false)
    }
    if (
      robotKey &&
      dof > 0 &&
      Array.isArray(snap.initial_point) &&
      snap.initial_point.length >= dof &&
      snap.initial_point.slice(0, dof).every((x) => typeof x === 'number' && Number.isFinite(x))
    ) {
      setInitialPosition(robotKey, snap.initial_point.slice(0, dof))
    }
  }

  /** Effective boundary for a model: stored values clamped inside the model's joint limits. */
  function boundaryFor(key: string, model: [number, number][]): Boundary {
    return normalizeBoundary(boundaries.value[key], model)
  }
  function setBoundary(key: string, b: Boundary, model: [number, number][]) {
    boundaries.value = { ...boundaries.value, [key]: normalizeBoundary(b, model) }
  }
  function resetBoundary(key: string) {
    const next = { ...boundaries.value }
    delete next[key]
    boundaries.value = next
  }

  return {
    stepMm,
    stepDeg,
    jointStepDeg,
    attitudeStepDeg,
    collisionSensitivity,
    initialPositions,
    tcpPresets,
    worldOffset,
    coordPresets,
    mounting,
    speedPct,
    boundaries,
    defaultRobot,
    restoreSession,
    session,
    realIp,
    setStepMm,
    setStepDeg,
    setJointStepDeg,
    setAttitudeStepDeg,
    setCollisionSensitivity,
    setSpeedPct,
    setRealIp,
    initialPositionFor,
    setInitialPosition,
    resetInitialPosition,
    addTcpPreset,
    removeTcpPreset,
    setWorldOffset,
    addCoordPreset,
    removeCoordPreset,
    setMountingPreset,
    setMountingAngles,
    applyFromRealController,
    boundaryFor,
    setBoundary,
    resetBoundary,
    save,
  }
})
