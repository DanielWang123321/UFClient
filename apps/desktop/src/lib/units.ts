// Display formatting only. No kinematics here (design doc §8).
export function fmt(v: number | undefined | null, digits = 3): string {
  if (v === undefined || v === null || !Number.isFinite(v)) return '—'
  const s = v.toFixed(digits)
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s
}

export function fmtPct(ratio: number, digits = 1): string {
  return `${fmt(ratio * 100, digits)}%`
}

export type UtilLevel = 'ok' | 'warn' | 'high' | 'over'

/** Torque utilisation colour bands: green <50%, yellow 50–80%, red ≥80%, over ≥100%. */
export function utilLevel(ratio: number, warn = 0.5, high = 0.8): UtilLevel {
  const r = Math.abs(ratio)
  if (r >= 1) return 'over'
  if (r >= high) return 'high'
  if (r >= warn) return 'warn'
  return 'ok'
}

export const degToRad = (d: number) => (d * Math.PI) / 180

/** Strip arm/box SN prefixes from raw xArm SDK firmware string (e.g. `6,6,XI1305,AC1310,v2.8.2` -> `v2.8.2`). */
export function formatFirmwareVersion(raw: string | undefined | null): string {
  const s = (raw ?? '').trim()
  if (!s) return '—'
  const parts = s
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
  if (parts.length === 0) return '—'
  const tail = parts[parts.length - 1]
  const match = /v?(\d+\.\d+(?:\.\d+)?)/i.exec(tail)
  if (match) return `v${match[1]}`
  return parts.length > 1 ? '—' : tail
}
