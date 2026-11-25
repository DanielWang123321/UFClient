// User settings (Settings dialog & persisted jog speed), persisted to localStorage.
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { MOTION, sanitizeSpeedPct, sanitizeStep } from '../lib/motion'
import { normalizeBoundary, type Boundary } from '../lib/boundary'

export const SETTINGS_KEY = 'ugclient.settings'

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
  speedPct?: number
  boundaries?: Record<string, Partial<Boundary>>
  defaultRobot?: string
  restoreSession?: boolean
  session?: SessionConfig | null
}

function read(): Stored {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Stored
  } catch {
    return {}
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const s = read()
  const stepMm = ref(sanitizeStep(s.stepMm, MOTION.stepMmRange, MOTION.stepMm))
  const stepDeg = ref(sanitizeStep(s.stepDeg, MOTION.stepDegRange, MOTION.stepDeg))
  const speedPct = ref(sanitizeSpeedPct(s.speedPct, MOTION.defaultSpeedPct))
  const boundaries = ref<Record<string, Partial<Boundary>>>(s.boundaries ?? {})
  const defaultRobot = ref(s.defaultRobot ?? 'uf850')
  const restoreSession = ref(s.restoreSession ?? false)
  const session = ref<SessionConfig | null>(s.session ?? null)

  function save() {
    const data: Stored = {
      stepMm: stepMm.value, stepDeg: stepDeg.value, speedPct: speedPct.value,
      boundaries: boundaries.value, defaultRobot: defaultRobot.value,
      restoreSession: restoreSession.value, session: session.value,
    }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data))
    } catch {
      /* keep UI functional when localStorage is unavailable */
    }
  }
  watch([stepMm, stepDeg, speedPct, boundaries, defaultRobot, restoreSession, session], save, { deep: true })

  function setStepMm(v: unknown) {
    stepMm.value = sanitizeStep(v, MOTION.stepMmRange, stepMm.value)
  }
  function setStepDeg(v: unknown) {
    stepDeg.value = sanitizeStep(v, MOTION.stepDegRange, stepDeg.value)
  }
  function setSpeedPct(v: unknown) {
    const n = Number(v)
    if (Number.isFinite(n)) speedPct.value = Math.min(100, Math.max(1, Math.round(n)))
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
    stepMm, stepDeg, speedPct, boundaries, defaultRobot, restoreSession, session,
    setStepMm, setStepDeg, setSpeedPct, boundaryFor, setBoundary, resetBoundary, save,
  }
})
