// Physical UFACTORY robot connection & state store (default mode is always simulation).
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useEngineStore } from './engine'
import { useRobotStore } from './robot'
import { REAL_DEFAULT_SPEED_PCT, useSettingsStore } from './settings'
import type { RealGripperEnableResult, RealGripperMoveResult, RealStatus } from '../rpc/types'
import { STATE } from '../lib/motion'
import type { GripperState, SupportedGripper } from '../lib/gripper'

export const useRealStore = defineStore('real', () => {
  const engine = useEngineStore()
  const robot = useRobotStore()
  const settings = useSettingsStore()

  const connecting = ref(false)
  const refreshingSettings = ref(false)
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
  const gripperBusy = ref(false)
  const gripperEnabled = ref<Partial<Record<SupportedGripper, boolean>>>({})
  const gripperError = ref('')

  const isRealMode = computed(() => connected.value)
  const canMove = computed(() => connected.value && enabled.value && errorCode.value === 0)

  function vecChanged(a: number[], b: number[], eps = 1e-4): boolean {
    if (a.length !== b.length) return true
    return a.some((v, i) => Math.abs(v - (b[i] ?? 0)) > eps)
  }

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

    if (!snap.connected) {
      gripperEnabled.value = {}
      gripperError.value = ''
    } else {
      const targetKey = snap.robot_key || robot.key
      const targetDof = snap.dof || robot.info?.dof || 6
      settings.applyFromRealController(targetKey, targetDof, snap)

      if (
        robot.sessionId &&
        Array.isArray(snap.tcp_offset) &&
        snap.tcp_offset.length === 6 &&
        vecChanged(snap.tcp_offset, robot.tcpOffset)
      ) {
        void robot.applyTcp(snap.tcp_offset)
      }
      if (
        robot.sessionId &&
        snap.payload &&
        (Math.abs(snap.payload.mass_kg - robot.payload.mass_kg) > 1e-4 ||
          vecChanged(snap.payload.com_mm, robot.payload.com_mm))
      ) {
        void robot.applyPayload(snap.payload)
      }
      if (Array.isArray(snap.q_deg) && snap.q_deg.length > 0 && snap.q_deg.length === targetDof) {
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
      void refreshSettings()
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
      gripperEnabled.value = {}
      gripperError.value = ''
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

  async function refreshSettings(): Promise<boolean> {
    if (!connected.value) return false
    refreshingSettings.value = true
    try {
      const snap = await engine.call<RealStatus>('real.read_settings')
      if (connected.value) applySnapshot(snap)
      return true
    } catch (e) {
      if (connected.value) {
        lastError.value = e instanceof Error ? e.message : String(e)
      }
      return false
    } finally {
      refreshingSettings.value = false
    }
  }

  async function enableGripper(ee: SupportedGripper): Promise<boolean> {
    if (!connected.value) return false
    gripperBusy.value = true
    gripperError.value = ''
    try {
      const res = await engine.call<RealGripperEnableResult>('real.gripper_enable', { gripper: ee })
      gripperEnabled.value = { ...gripperEnabled.value, [ee]: Boolean(res.enabled) }
      if (typeof res.pos === 'number' && Number.isFinite(res.pos)) {
        robot.setGripperParams(ee, { pos: res.pos })
      }
      return true
    } catch (e) {
      gripperError.value = e instanceof Error ? e.message : String(e)
      return false
    } finally {
      gripperBusy.value = false
    }
  }

  async function moveGripper(ee: SupportedGripper, params?: Partial<GripperState>): Promise<boolean> {
    if (params) robot.setGripperParams(ee, params)
    const stateVal = robot.gripperStates[ee]
    if (!connected.value) return true
    gripperError.value = ''
    try {
      const res = await engine.call<RealGripperMoveResult>('real.gripper_move', {
        gripper: ee,
        pos: stateVal.pos,
        speed: stateVal.speed,
        force: stateVal.force,
      })
      robot.setGripperParams(ee, { pos: res.pos, speed: res.speed, force: res.force })
      return true
    } catch (e) {
      gripperError.value = e instanceof Error ? e.message : String(e)
      return false
    }
  }

  function clearNotice() {
    lastError.value = ''
  }

  return {
    connecting,
    refreshingSettings,
    busy,
    connected,
    ip,
    robotKey,
    dof,
    version,
    sn,
    state,
    mode,
    errorCode,
    warnCode,
    enabled,
    isSimulationRobot,
    lastError,
    gripperBusy,
    gripperEnabled,
    gripperError,
    isRealMode,
    canMove,
    applySnapshot,
    connect,
    disconnect,
    setEnable,
    clearError,
    stop,
    refreshSettings,
    enableGripper,
    moveGripper,
    clearNotice,
  }
})
