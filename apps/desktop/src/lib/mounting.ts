// Mounting preset helpers and inverse/forward helpers aligned with UFACTORY Studio.
export type MountingPresetId = 'floor' | 'ceiling' | 'wallUp' | 'wallDown' | 'custom'

export interface MountingConfig {
  preset: MountingPresetId
  tiltDeg: number
  rotateDeg: number
}

export interface MountingPreset {
  id: Exclude<MountingPresetId, 'custom'>
  tiltDeg: number
  rotateDeg: number
}

export const MOUNTING_PRESETS: readonly MountingPreset[] = [
  { id: 'floor', tiltDeg: 0, rotateDeg: 0 },
  { id: 'ceiling', tiltDeg: 180, rotateDeg: 0 },
  { id: 'wallUp', tiltDeg: 90, rotateDeg: 180 },
  { id: 'wallDown', tiltDeg: 90, rotateDeg: 0 },
] as const

export const DEFAULT_MOUNTING: MountingConfig = {
  preset: 'floor',
  tiltDeg: 0,
  rotateDeg: 0,
}

export function clampTiltDeg(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  const clamped = Math.min(180, Math.max(0, n))
  return Math.round(clamped * 10) / 10
}

export function clampRotateDeg(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  const clamped = Math.min(180, Math.max(-180, n))
  return Math.round(clamped * 10) / 10
}

export function matchMountingPreset(tiltDeg: number, rotateDeg: number, tol = 0.5): MountingPresetId {
  if (Math.abs(tiltDeg) <= tol) return 'floor'
  if (Math.abs(tiltDeg - 180) <= tol) return 'ceiling'
  if (Math.abs(tiltDeg - 90) <= tol && Math.abs(Math.abs(rotateDeg) - 180) <= tol) return 'wallUp'
  if (Math.abs(tiltDeg - 90) <= tol && Math.abs(rotateDeg) <= tol) return 'wallDown'
  return 'custom'
}

export function sanitizeMounting(raw: unknown): MountingConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_MOUNTING }
  const obj = raw as Partial<MountingConfig>
  const tiltDeg = clampTiltDeg(obj.tiltDeg, 0)
  const rotateDeg = clampRotateDeg(obj.rotateDeg, 0)
  const preset = obj.preset === 'custom' ? 'custom' : matchMountingPreset(tiltDeg, rotateDeg)
  return { preset, tiltDeg, rotateDeg }
}

export function formatMountingLabel(m: MountingConfig, t: (key: string) => string): string {
  switch (m.preset) {
    case 'floor':
      return t('settings.motion.mountFloorShort')
    case 'ceiling':
      return t('settings.motion.mountCeilingShort')
    case 'wallUp':
      return t('settings.motion.mountWallUpShort')
    case 'wallDown':
      return t('settings.motion.mountWallDownShort')
    case 'custom':
      return `${t('settings.motion.mountCustom')} (${Math.round(m.tiltDeg)}°, ${Math.round(m.rotateDeg)}°)`
  }
}
