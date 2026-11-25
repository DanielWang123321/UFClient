// Physical UFACTORY robot connection & state store (default mode is always simulation).
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useEngineStore } from './engine'
import { useRobotStore } from './robot'
import { REAL_DEFAULT_SPEED_PCT, useSettingsStore } from './settings'
import type { RealStatus } from '../rpc/types'
import { STATE } from '../lib/motion'

export const useRealStore = defineStore('real', () => {
  const engine = useEngineStore()
  const robot = useRobotStore()
  const settings = useSettingsStore()

  const connecting = ref(false)
  const busy = ref(false)
  const connected = ref(false)
  const ip = ref(settings.realIp)
  const robotKey = ref('')
  const dof = ref(0)
  const version = ref('')
  const sn = ref('')
  const state = ref<number>(STATE.stopped)
  const mode = ref(0)
  const errorCode = ref(0)
  const warnCode = ref(0)
  const enabled = ref(false)
  const isSimulationRobot = ref(false)
  const lastError = ref('')

  const isRealMode = computed(() => connected.value)
  const canMove = computed(() => connected.value && enabled.value && errorCode.value === 0)

  function applySnapshot(snap: RealStatus) {
    connected.value = Boolean(snap.connected)
    if (snap.ip) ip.value = snap.ip
    robotKey.value = snap.robot_key ?? ''
    dof.value = snap.dof ?? 0
    version.value = snap.version ?? ''
    sn.value = snap.sn ?? ''
    state.value = snap.state ?? STATE.stopped
    mode.value = snap.mode ?? 0
    errorCode.value = snap.error_code ?? 0
    warnCode.value = snap.warn_code ?? 0
    enabled.value = Boolean(snap.enabled)
    isSimulationRobot.value = Boolean(snap.is_simulation_robot)

    if (snap.connected && Array.isArray(snap.q_deg) && snap.q_deg.length > 0) {
      const targetDof = robot.info?.dof ?? snap.dof
      if (snap.q_deg.length === targetDof) {
        robot.applyExternalState(snap.q_deg, snap.tcp_pose)
      }
    }
  }

  // Subscribe to 15 Hz server-pushed real.state notifications.
  engine.onNotification('real.state', (params) => {
    if (params && typeof params === 'object') {
      applySnapshot(params as RealStatus)
    }
  })

  async function connect(targetIp = ip.value): Promise<boolean> {
    const cleanIp = targetIp.trim()
    if (!cleanIp) {
      lastError.value = 'IP address is required'
      return false
    }
    connecting.value = true
    lastError.value = ''
    try {
      const snap = await engine.call<RealStatus>('real.connect', { ip: cleanIp })
      settings.setRealIp(cleanIp)
      ip.value = cleanIp
      if (snap.robot_key && snap.robot_key !== robot.key) {
        await robot.load(snap.robot_key, 'none')
      }
      if (snap.tcp_offset?.length === 6) {
        await robot.applyTcp(snap.tcp_offset)
      }
      if (snap.payload) {
        await robot.applyPayload(snap.payload)
      }
      // Safety: always start real-robot mode at a conservative speed (20%).
      settings.setSpeedPct(REAL_DEFAULT_SPEED_PCT)
      applySnapshot(snap)
      return true
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
      return false
    } finally {
      connecting.value = false
    }
  }

  async function disconnect(): Promise<void> {
    busy.value = true
    lastError.value = ''
    try {
      const snap = await engine.call<RealStatus>('real.disconnect')
      applySnapshot(snap)
    } catch (e) {
      connected.value = false
      enabled.value = false
      lastError.value = e instanceof Error ? e.message : String(e)
    } finally {
      busy.value = false
    }
  }

  async function setEnable(next: boolean): Promise<boolean> {
    busy.value = true
    lastError.value = ''
    try {
      const snap = await engine.call<RealStatus>('real.enable', { enable: next })
      applySnapshot(snap)
      return true
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
      return false
    } finally {
      busy.value = false
    }
  }

  async function clearError(): Promise<boolean> {
    busy.value = true
    lastError.value = ''
    try {
      const snap = await engine.call<RealStatus>('real.clear_error')
      applySnapshot(snap)
      return true
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
      return false
    } finally {
      busy.value = false
    }
  }

  async function stop(emergency = false, decel = false): Promise<void> {
    if (!connected.value) return
    try {
      const snap = await engine.call<RealStatus>('real.stop', { emergency, decel })
      // Never let a delayed stop reply mask a newer fault or disconnect notification.
      if (!connected.value || (errorCode.value !== 0 && snap.error_code === 0)) return
      applySnapshot(snap)
    } catch {
      /* stop is best-effort and must never throw to UI event handlers */
    }
  }

  async function writeTcp(offset: number[]): Promise<boolean> {
    busy.value = true
    lastError.value = ''
    try {
      const snap = await engine.call<RealStatus>('real.set_tcp', { offset: [...offset] })
      await robot.applyTcp(offset)
      applySnapshot(snap)
      return true
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
      return false
    } finally {
      busy.value = false
    }
  }

  async function writePayload(p: { mass_kg: number; com_mm: number[] }): Promise<boolean> {
    busy.value = true
    lastError.value = ''
    try {
      const snap = await engine.call<RealStatus>('real.set_payload', {
        mass_kg: p.mass_kg,
        com_mm: [...p.com_mm],
      })
      await robot.applyPayload(p)
      applySnapshot(snap)
      return true
    } catch (e) {
      lastError.value = e instanceof Error ? e.message : String(e)
      return false
    } finally {
      busy.value = false
    }
  }

  function clearNotice() {
    lastError.value = ''
  }

  return {
    connecting, busy, connected, ip, robotKey, dof, version, sn, state, mode,
    errorCode, warnCode, enabled, isSimulationRobot, lastError, isRealMode, canMove,
    applySnapshot, connect, disconnect, setEnable, clearError, stop, writeTcp, writePayload, clearNotice,
  }
})
