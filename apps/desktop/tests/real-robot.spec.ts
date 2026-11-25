import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import MotionPanel from '../src/components/MotionPanel.vue'
import StageNotices from '../src/components/StageNotices.vue'
import { useEngineStore } from '../src/stores/engine'
import { useRobotStore } from '../src/stores/robot'
import { useRealStore } from '../src/stores/real'
import { useMotionStore } from '../src/stores/motion'
import { DEFAULT_REAL_IP, REAL_DEFAULT_SPEED_PCT, useSettingsStore } from '../src/stores/settings'
import { RpcClient } from '../src/rpc/client'
import { FakeWs, HELLO } from './fakeEngine'
import { i18n } from '../src/i18n'
import type { RealStatus } from '../src/rpc/types'

function makeLoad(key: string) {
  return {
    key,
    robot_name: key,
    dof: 6,
    session_id: `s-${key}`,
    joint_names: ['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6'],
    effort_limits_nm: [179.4, 179.4, 92, 81.5, 30.6, 30.6],
    visual_urdf_relpath: `urdf/${key}/${key}_visual.glb.urdf`,
    home_q_deg: [0, 0, 0, 0, 0, 0],
    end_effectors: ['none', 'gripper_g2', 'bio_gripper_g2', 'vacuum_gripper'],
    limits_deg: [[-360, 360], [-118, 120], [-225, 11], [-360, 360], [-97, 180], [-360, 360]] as [number, number][],
    default_q_deg: [0, 0, 0, 0, 0, 0],
    end_effector: 'none',
    default_tcp_offset: [0, 0, 0, 0, 0, 0],
    default_tcp_source: 'none',
  }
}

function makeRealSnap(overrides: Partial<RealStatus> = {}): RealStatus {
  return {
    connected: true,
    ip: DEFAULT_REAL_IP,
    robot_key: 'xarm6_1305',
    dof: 6,
    version: '2.8.1',
    sn: 'XI1305060001',
    state: 2,
    mode: 0,
    error_code: 0,
    warn_code: 0,
    enabled: false,
    is_simulation_robot: false,
    q_deg: [12, -25, -40, 0, 65, 10],
    tcp_pose: [350, 0, 220, 180, 0, 0],
    tcp_offset: [0, 0, 173.5, 0, 0, 0],
    payload: { mass_kg: 0.8, com_mm: [0, 0, 40] },
    ...overrides,
  }
}

describe('real xArm6 store & dual-channel motion', () => {
  let ws: FakeWs
  let snap: RealStatus
  let rejectBoundary = false

  beforeEach(async () => {
    localStorage.clear()
    i18n.global.locale.value = 'zh'
    setActivePinia(createPinia())
    rejectBoundary = false
    snap = makeRealSnap()

    const handlers = {
      'system.hello': () => HELLO,
      'robot.load': (p: Record<string, unknown>) => makeLoad(String(p.robot ?? 'uf850')),
      'tcp.set': () => ({ ok: true }),
      'payload.set': () => ({ ok: true }),
      'kin.fk': () => ({ tcp_pose: [300, 0, 200, 180, 0, 0], flange_pose: [300, 0, 200, 180, 0, 0] }),
      'dyn.gravity': () => ({ tau_nm: [0, 0, 0, 0, 0, 0], effort_limits_nm: [1, 1, 1, 1, 1, 1], utilization: [0, 0, 0, 0, 0, 0], over_limit: [] }),
      'motion.align': () => ({ q_deg: [12, -25, -40, 0, 65, 0], tcp_pose: [350, 0, 220, 180, 0, 0] }),
      'real.connect': (p: Record<string, unknown>) => {
        snap = makeRealSnap({ ip: String(p.ip ?? DEFAULT_REAL_IP), enabled: false })
        return snap
      },
      'real.disconnect': () => {
        snap = makeRealSnap({ connected: false, enabled: false, robot_key: '', dof: 0, q_deg: [], tcp_pose: [] })
        return snap
      },
      'real.enable': (p: Record<string, unknown>) => {
        snap = { ...snap, enabled: Boolean(p.enable) }
        return snap
      },
      'real.stop': () => {
        snap = { ...snap, state: 4 }
        return snap
      },
      'real.step_joint': () => {
        if (rejectBoundary) {
          throw { code: 6005, message: 'boundary', data: { boundary: { kind: 'joint', index: 0, side: 'max', limit: 20 } } }
        }
        return { ok: true }
      },
      'real.step_tcp': () => ({ ok: true }),
      'real.move_joints': () => ({ ok: true }),
      'real.jog_joint_vel': () => ({ ok: true }),
      'real.jog_tcp_vel': () => ({ ok: true }),
      'real.set_tcp': (p: Record<string, unknown>) => {
        snap = { ...snap, tcp_offset: [...(p.offset as number[])] }
        return snap
      },
      'real.set_payload': (p: Record<string, unknown>) => {
        snap = { ...snap, payload: { mass_kg: Number(p.mass_kg), com_mm: [...(p.com_mm as [number, number, number])] } }
        return snap
      },
    }
    await useEngineStore().connect(
      async () => ({ port: 1, token: 't' }),
      () => new RpcClient(() => (ws = new FakeWs(handlers))),
    )
    await useRobotStore().load('uf850')
  })

  afterEach(() => useMotionStore().stop())

  it('defaults IP to 192.168.1.60, switches model to xarm6_1305, resets speed to 20%, and syncs pushed telemetry without extra FK calls', async () => {
    const settings = useSettingsStore()
    const robot = useRobotStore()
    const real = useRealStore()

    expect(settings.realIp).toBe('192.168.1.60')
    settings.setSpeedPct(85)

    expect(await real.connect()).toBe(true)
    expect(real.connected).toBe(true)
    expect(real.enabled).toBe(false)
    expect(robot.key).toBe('xarm6_1305')
    expect(robot.tcpOffset).toEqual([0, 0, 173.5, 0, 0, 0])
    expect(robot.payload).toEqual({ mass_kg: 0.8, com_mm: [0, 0, 40] })
    expect(settings.speedPct).toBe(REAL_DEFAULT_SPEED_PCT)
    expect(robot.q).toEqual([12, -25, -40, 0, 65, 10])

    const fkCallsBefore = ws.sent.filter((c) => c.method === 'kin.fk').length
    ws.push('real.state', makeRealSnap({ q_deg: [15, -20, -35, 1, 60, 5], tcp_pose: [360, 5, 225, 180, 0, 0] }))
    await flushPromises()
    expect(robot.q).toEqual([15, -20, -35, 1, 60, 5])
    expect(robot.fk?.tcp_pose).toEqual([360, 5, 225, 180, 0, 0])
    expect(ws.sent.filter((c) => c.method === 'kin.fk').length).toBe(fkCallsBefore)
  })

  it('guards MotionPanel until enabled, routes click/hold/Home/STOP to real.* RPCs, and maps boundary notices', async () => {
    const real = useRealStore()
    const motion = useMotionStore()
    await real.connect('192.168.1.60')

    const panel = mount(MotionPanel, { attachTo: document.body, global: { plugins: [i18n] } })
    expect(panel.find('[data-test="real-guard-hint"]').exists()).toBe(true)
    expect(panel.find('[data-test="x+"]').attributes('disabled')).toBeDefined()

    // Enable motors -> controls unlock
    expect(await real.setEnable(true)).toBe(true)
    await flushPromises()
    expect(panel.find('[data-test="real-guard-hint"]').exists()).toBe(false)
    expect(panel.find('[data-test="x+"]').attributes('disabled')).toBeUndefined()

    // Click TCP step & joint step
    await motion.step({ kind: 'tcp', axis: 'x' }, 1)
    expect(ws.sent.some((c) => c.method === 'real.step_tcp' && c.params.axis === 'x')).toBe(true)

    await motion.step({ kind: 'joint', index: 0 }, 1)
    expect(ws.sent.some((c) => c.method === 'real.step_joint' && c.params.index === 0)).toBe(true)

    // Continuous velocity jog sends real.jog_joint_vel and STOP fires real.stop
    const cont = motion.startContinuous({ kind: 'joint', index: 1 }, -1)
    await flushPromises()
    expect(ws.sent.some((c) => c.method === 'real.jog_joint_vel')).toBe(true)
    motion.stop({ decel: true })
    await cont
    expect(ws.sent.some((c) => c.method === 'real.stop' && c.params.decel === true)).toBe(true)

    // Backend boundary violation surfaces structured MotionNotice
    rejectBoundary = true
    await motion.step({ kind: 'joint', index: 0 }, 1)
    await flushPromises()
    expect(motion.notice).toMatchObject({ kind: 'boundary', axis: 'J1', side: 'max' })

    // Controller error locks panel and triggers StageNotices alert
    const notices = mount(StageNotices, { global: { plugins: [i18n] } })
    ws.push('real.state', makeRealSnap({ enabled: false, error_code: 23 }))
    await flushPromises()
    expect(panel.find('[data-test="x+"]').attributes('disabled')).toBeDefined()
    expect(notices.find('[data-test="real-fault-notice"]').text()).toContain('23')

    await real.disconnect()
    await flushPromises()
    expect(real.connected).toBe(false)
    expect(panel.find('[data-test="x+"]').attributes('disabled')).toBeUndefined()
    panel.unmount()
    notices.unmount()
  })
})
