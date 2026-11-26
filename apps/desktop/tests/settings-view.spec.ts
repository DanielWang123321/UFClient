import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import SettingsView from '../src/views/SettingsView.vue'
import StageTelemetry from '../src/components/StageTelemetry.vue'
import RobotPanel from '../src/components/RobotPanel.vue'
import { useEngineStore } from '../src/stores/engine'
import { useRobotStore } from '../src/stores/robot'
import { useRealStore } from '../src/stores/real'
import { DEFAULT_REAL_IP, useSettingsStore } from '../src/stores/settings'
import { RpcClient } from '../src/rpc/client'
import { FakeWs, HELLO } from './fakeEngine'
import { i18n } from '../src/i18n'
import type { RealStatus } from '../src/rpc/types'

function makeLoad(key = 'uf850') {
  return {
    key,
    robot_name: key,
    dof: 6,
    session_id: `s-${key}`,
    joint_names: ['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6'],
    effort_limits_nm: [179.4, 179.4, 92, 81.5, 30.6, 30.6],
    visual_urdf_relpath: `urdf/${key}/${key}_visual.glb.urdf`,
    home_q_deg: [0, 0, 0, 0, 0, 0],
    end_effectors: ['none', 'gripper_g2'],
    limits_deg: [[-360, 360], [-132, 132], [-242, 3.5], [-360, 360], [-124, 124], [-360, 360]] as [number, number][],
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
    enabled: true,
    is_simulation_robot: false,
    q_deg: [0, -20, -30, 0, 50, 0],
    tcp_pose: [350, 0, 220, 180, 0, 0],
    tcp_offset: [0, 0, 174, 0, 0, 0],
    payload: { mass_kg: 1.035, com_mm: [0, 0, 52.3] },
    collision_sensitivity: 5,
    world_offset: [0, 0, 0, 0, 0, 0],
    gravity_direction: [0, 0, 1],
    mount_direction: [180, 0],
    initial_point: [-0.4, -31.7, -25.7, 0.2, 57.4, -0.2],
    ...overrides,
  }
}

describe('SettingsView secondary page & sub-pages', () => {
  let ws: FakeWs
  let snap: RealStatus

  beforeEach(async () => {
    localStorage.clear()
    i18n.global.locale.value = 'en'
    setActivePinia(createPinia())
    snap = makeRealSnap()

    const handlers = {
      'system.hello': () => HELLO,
      'robot.list': () => [{ key: 'uf850', robot_name: 'uf850', dof: 6, end_effectors: ['none', 'gripper_g2'] }],
      'robot.load': (p: Record<string, unknown>) => makeLoad(String(p.robot ?? 'uf850')),
      'tcp.set': () => ({ ok: true }),
      'payload.set': () => ({ ok: true }),
      'kin.fk': () => ({ tcp_pose: [300, 0, 200, 180, 0, 0], flange_pose: [300, 0, 200, 180, 0, 0] }),
      'dyn.gravity': () => ({ tau_nm: [0, 0, 0, 0, 0, 0], effort_limits_nm: [1, 1, 1, 1, 1, 1], utilization: [0, 0, 0, 0, 0, 0], over_limit: [] }),
      'real.connect': () => snap,
      'real.disconnect': () => makeRealSnap({ connected: false, enabled: false, robot_key: '', dof: 0, q_deg: [], tcp_pose: [] }),
      'real.read_settings': () => snap,
    }
    await useEngineStore().connect(
      async () => ({ port: 1, token: 't' }),
      () => new RpcClient(() => (ws = new FakeWs(handlers))),
    )
    await useRobotStore().fetchRobots()
    await useRobotStore().load('uf850')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('switches all 5 Studio categories, filters with search, and emits back', async () => {
    const wrapper = mount(SettingsView, { attachTo: document.body, global: { plugins: [i18n] } })

    expect(wrapper.find('[data-test="settings-page-motion"]').exists()).toBe(true)
    expect(wrapper.find('[data-test^="settings-sub-"]').exists()).toBe(false)
    expect(wrapper.find('.anchor-pill').exists()).toBe(false)
    expect(wrapper.find('[data-test="joint-step-deg"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="payload-mass"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="mount-floor"]').exists()).toBe(true)

    await wrapper.find('[data-test="settings-nav-externals"]').trigger('click')
    expect(wrapper.find('[data-test="settings-page-externals"]').exists()).toBe(true)

    await wrapper.find('[data-test="settings-nav-safety"]').trigger('click')
    expect(wrapper.find('[data-test="settings-page-safety"]').exists()).toBe(true)

    await wrapper.find('[data-test="settings-nav-general"]').trigger('click')
    expect(wrapper.find('[data-test="settings-page-general"]').exists()).toBe(true)
    const generalText = wrapper.find('[data-test="settings-page-general"]').text()
    expect(generalText).toContain('0.3.2')
    expect(generalText).toContain('ufclient-core')
    expect(generalText).toContain('BSD-3-Clause')

    await wrapper.find('[data-test="settings-nav-device"]').trigger('click')
    expect(wrapper.find('[data-test="settings-page-device"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="settings-page-device"]').text()).toContain('Simulation')

    await wrapper.find('[data-test="settings-search"]').setValue('Safety')
    expect(wrapper.find('[data-test="settings-nav-safety"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="settings-nav-externals"]').exists()).toBe(false)

    await wrapper.find('[data-test="settings-back"]').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
    wrapper.unmount()
  })

  it('updates Mounting presets in simulation mode and omits mounting display in RobotPanel & StageTelemetry without any real.* calls', async () => {
    const settings = useSettingsStore()
    const wrapper = mount(SettingsView, { attachTo: document.body, global: { plugins: [i18n] } })
    const robotPanel = mount(RobotPanel, { global: { plugins: [i18n] } })
    const telemetry = mount(StageTelemetry, { global: { plugins: [i18n] } })

    expect(robotPanel.find('[data-test="robot-mounting"]').exists()).toBe(false)
    expect(telemetry.find('[data-test="telemetry-mounting"]').exists()).toBe(false)

    await wrapper.find('[data-test="mount-ceiling"]').trigger('click')
    await flushPromises()
    expect(settings.mounting).toEqual({ preset: 'ceiling', tiltDeg: 180, rotateDeg: 0 })
    expect(robotPanel.find('[data-test="robot-mounting"]').exists()).toBe(false)
    expect(telemetry.find('[data-test="telemetry-mounting"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="mount-rotate"]').find('input').attributes('disabled')).toBeDefined()

    // Apply TCP & Payload in simulation updates local Pinocchio only
    await wrapper.find('[data-test="tcp-payload-apply"]').trigger('click')
    await flushPromises()
    expect(ws.sent.some((c) => c.method === 'payload.set')).toBe(true)
    expect(ws.sent.some((c) => c.method === 'tcp.set')).toBe(true)
    expect(ws.sent.some((c) => c.method.startsWith('real.'))).toBe(false)

    // Initial Position editor captures current robot pose and saves per model
    await useRobotStore().setQ([12, -15, 0, 0, 20, 0])
    await wrapper.find('[data-test="initial-pos-set"]').trigger('click')
    expect(wrapper.find('[data-test="initial-pos-editor"]').exists()).toBe(true)
    const buttons = wrapper.find('[data-test="initial-pos-editor"]').findAll('button')
    await buttons[0].trigger('click')
    await wrapper.find('[data-test="initial-pos-apply"]').trigger('click')
    expect(settings.initialPositionFor('uf850', 6)).toEqual([12, -15, 0, 0, 20, 0])

    wrapper.unmount()
    robotPanel.unmount()
    telemetry.unmount()
  })

  it('locks controller parameters read-only in real mode and overwrites local state on real.read_settings with zero real writes', async () => {
    const real = useRealStore()
    const settings = useSettingsStore()
    await real.connect('192.168.1.60')
    await flushPromises()

    const wrapper = mount(SettingsView, { attachTo: document.body, global: { plugins: [i18n] } })
    expect(wrapper.find('[data-test="real-readonly-banner"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="tcp-payload-apply"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="coord-apply"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="initial-pos-set"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="mount-floor"]').attributes('disabled')).toBeDefined()

    // Controller changes on robot side -> clicking Read from robot overwrites local state
    snap = makeRealSnap({
      collision_sensitivity: 2,
      world_offset: [50, 10, 0, 0, 0, 30],
      mount_direction: [90, 0],
      initial_point: [10, 0, 0, 0, 0, 0],
    })
    await wrapper.find('[data-test="real-refresh-settings"]').trigger('click')
    await flushPromises()

    expect(settings.collisionSensitivity).toBe(2)
    expect(settings.worldOffset).toEqual([50, 10, 0, 0, 0, 30])
    expect(settings.mounting).toEqual({ preset: 'wallDown', tiltDeg: 90, rotateDeg: 0 })
    expect(settings.initialPositionFor('xarm6_1305', 6)).toEqual([10, 0, 0, 0, 0, 0])
    expect(ws.sent.some((c) => c.method.startsWith('real.set_'))).toBe(false)

    // My Device shows connected controller info
    await wrapper.find('[data-test="settings-nav-device"]').trigger('click')
    const deviceText = wrapper.find('[data-test="settings-page-device"]').text()
    expect(deviceText).toContain('192.168.1.60')
    expect(deviceText).toContain('XI1305060001')

    wrapper.unmount()
  })

  it('edits Initial Position in sim and renders Safety boundary, General 0.3.2 About, and My Device controller summary', async () => {
    const settings = useSettingsStore()
    const robot = useRobotStore()
    const real = useRealStore()
    await robot.setQ([12, -15, -20, 0, 30, 5])

    const wrapper = mount(SettingsView, { attachTo: document.body, global: { plugins: [i18n] } })

    // Initial Position drawer: use current pose + apply
    await wrapper.find('[data-test="initial-pos-set"]').trigger('click')
    expect(wrapper.find('[data-test="initial-pos-editor"]').exists()).toBe(true)
    const buttons = wrapper.find('[data-test="initial-pos-editor"]').findAll('button')
    await buttons[0].trigger('click')
    await wrapper.find('[data-test="initial-pos-apply"]').trigger('click')
    expect(settings.initialPositionFor('uf850', 6)).toEqual([12, -15, -20, 0, 30, 5])

    // Safety sub-page renders boundary card
    await wrapper.find('[data-test="settings-nav-safety"]').trigger('click')
    expect(wrapper.find('[data-test="tcp-min-X"]').exists()).toBe(true)

    // General sub-page shows 0.3.2
    await wrapper.find('[data-test="settings-nav-general"]').trigger('click')
    expect(wrapper.find('[data-test="settings-page-general"]').text()).toContain('0.3.2')

    // My Device shows simulation status when disconnected, then controller summary when connected
    await wrapper.find('[data-test="settings-nav-device"]').trigger('click')
    expect(wrapper.find('[data-test="settings-page-device"]').text()).toContain('Simulation mode')

    await real.connect('192.168.1.60')
    await flushPromises()
    expect(wrapper.find('[data-test="settings-page-device"]').text()).toContain('XI1305060001')

    wrapper.unmount()
  })
})
