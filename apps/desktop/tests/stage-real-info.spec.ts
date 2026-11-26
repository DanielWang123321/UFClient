import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import StageRealInfo from '../src/components/StageRealInfo.vue'
import { RpcClient } from '../src/rpc/client'
import { i18n } from '../src/i18n'
import { useEngineStore } from '../src/stores/engine'
import { useRealStore } from '../src/stores/real'
import { useRobotStore } from '../src/stores/robot'
import { useSettingsStore } from '../src/stores/settings'
import { FakeWs, HELLO } from './fakeEngine'

describe('StageRealInfo overlay panel', () => {
  beforeEach(() => {
    localStorage.clear()
    i18n.global.locale.value = 'zh'
    setActivePinia(createPinia())
  })

  it('defaults robot store key to xarm6_1305 and renders status, TCP payload, and TCP offset values', () => {
    const robot = useRobotStore()
    expect(robot.key).toBe('xarm6_1305')

    const real = useRealStore()
    const settings = useSettingsStore()
    real.connected = true
    real.ip = '192.168.1.60'
    real.robotKey = 'xarm6_1305'
    real.version = '6,6,XI1305,AC1310,v2.8.2'
    real.sn = 'XI1305060001'
    real.state = 2
    real.mode = 0
    real.enabled = true
    real.errorCode = 0
    real.warnCode = 0
    settings.collisionSensitivity = 3
    robot.payload = { mass_kg: 1.035, com_mm: [0, 0, 52.3] }
    robot.tcpOffset = [0, 0, 174, 0, 0, 0]

    const wrapper = mount(StageRealInfo, {
      slots: {
        model: '<span data-test="slotted-model">xArm 6</span>',
      },
      global: { plugins: [i18n] },
    })

    expect(wrapper.find('[data-test="slotted-model"]').text()).toBe('xArm 6')
    expect(wrapper.find('.real-dot').classes()).toContain('live')
    expect(wrapper.find('[data-test="real-info-ip"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="real-info-motors"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('192.168.1.60')
    expect(wrapper.find('[data-test="real-info-state"]').text()).toBe('就绪 (2)')
    expect(wrapper.find('[data-test="real-info-mode"]').text()).toBe('位置 (0)')
    expect(wrapper.find('[data-test="real-info-firmware"]').text()).toBe('v2.8.2')
    expect(wrapper.text()).not.toContain('XI1305')
    expect(wrapper.text()).not.toContain('AC1310')
    expect(wrapper.text()).not.toContain('XI1305060001')
    expect(wrapper.find('[data-test="real-info-sensitivity"]').text()).toBe('3')
    expect(wrapper.find('[data-test="real-info-err"]').exists()).toBe(false)
    expect(wrapper.find('.ro-tag').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('真机只读')
    expect(wrapper.text()).not.toContain('Controller Read-Only')
    expect(wrapper.text()).toContain('TCP 负载')

    expect(wrapper.find('[data-test="real-info-mass"]').text()).toBe('1.035')
    expect(wrapper.find('[data-test="real-info-cx"]').text()).toBe('0.0')
    expect(wrapper.find('[data-test="real-info-cy"]').text()).toBe('0.0')
    expect(wrapper.find('[data-test="real-info-cz"]').text()).toBe('52.3')

    expect(wrapper.find('[data-test="real-info-tcp-x"]').text()).toBe('0.00')
    expect(wrapper.find('[data-test="real-info-tcp-z"]').text()).toBe('174.00')
    expect(wrapper.find('[data-test="real-info-tcp-roll"]').text()).toBe('0.00')
  })

  it('shows error/warning code row and splits stopped state and velocity mode labels', async () => {
    const real = useRealStore()
    real.connected = true
    real.state = 4
    real.mode = 5
    real.enabled = false
    real.errorCode = 19
    real.warnCode = 2

    const wrapper = mount(StageRealInfo, { global: { plugins: [i18n] } })
    expect(wrapper.find('.real-dot').classes()).toContain('fault')
    expect(wrapper.find('[data-test="real-info-motors"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="real-info-state"]').text()).toBe('已停止 (4)')
    expect(wrapper.find('[data-test="real-info-mode"]').text()).toBe('笛卡尔速度 (5)')
    expect(wrapper.find('[data-test="real-info-err"]').text()).toBe('19 / 2')
  })

  it('toggles collapsed state cleanly and updates aria and state/mode labels on locale switch', async () => {
    const real = useRealStore()
    real.connected = true
    real.state = 4
    real.mode = 5

    const wrapper = mount(StageRealInfo, { attachTo: document.body, global: { plugins: [i18n] } })
    const panel = wrapper.find('[data-test="stage-real-info"]')
    const toggle = wrapper.find('[data-test="stage-real-collapse"]')
    const body = wrapper.find('[data-test="stage-real-body"]')

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.attributes('data-chevron')).toBe('up')
    expect(body.isVisible()).toBe(true)
    expect(panel.classes()).not.toContain('is-collapsed')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('data-chevron')).toBe('down')
    expect(body.isVisible()).toBe(false)
    expect(panel.classes()).toContain('is-collapsed')

    i18n.global.locale.value = 'en'
    await flushPromises()
    expect(toggle.attributes('aria-label')).toContain('Expand')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(body.isVisible()).toBe(true)
    expect(body.text()).toContain('Robot Status')
    expect(wrapper.find('[data-test="real-info-state"]').text()).toBe('Stopped (4)')
    expect(wrapper.find('[data-test="real-info-mode"]').text()).toBe('Cart Vel (5)')
    wrapper.unmount()
  })

  it('triggers read-only real.refreshSettings RPC on refresh and updates TCP payload/offset on real.state stream', async () => {
    const calledMethods: string[] = []
    let ws!: FakeWs
    let snapshot = {
      connected: true,
      ip: '192.168.1.60',
      robot_key: 'xarm6_1305',
      dof: 6,
      version: '2.8.2',
      sn: 'XI1305060001',
      state: 2,
      mode: 0,
      error_code: 0,
      warn_code: 0,
      enabled: true,
      is_simulation_robot: false,
      q_deg: [0, 0, 0, 0, 0, 0],
      tcp_pose: [300, 0, 200, 180, 0, 0],
      tcp_offset: [0, 0, 174, 0, 0, 0],
      payload: { mass_kg: 1.035, com_mm: [0, 0, 52.3] },
      collision_sensitivity: 3,
      world_offset: [0, 0, 0, 0, 0, 0],
      gravity_direction: [0, 0, 1],
      mount_direction: [0, 0],
      initial_point: [0, 0, 0, 0, 0, 0],
    }

    const handlers = {
      'system.hello': () => HELLO,
      'robot.load': (p: Record<string, unknown>) => {
        const key = String(p.robot ?? 'xarm6_1305')
        return {
          key,
          robot_name: key,
          dof: 6,
          session_id: `s-${key}`,
          joint_names: ['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6'],
          effort_limits_nm: [179.4, 179.4, 92, 81.5, 30.6, 30.6],
          visual_urdf_relpath: `urdf/${key}/${key}_visual.glb.urdf`,
          home_q_deg: [0, 0, 0, 0, 0, 0],
          end_effectors: ['none'],
          limits_deg: [[-360, 360], [-118, 120], [-225, 11], [-360, 360], [-97, 180], [-360, 360]] as [number, number][],
          default_q_deg: [0, 0, 0, 0, 0, 0],
          end_effector: 'none',
          default_tcp_offset: [0, 0, 0, 0, 0, 0],
          default_tcp_source: 'none',
        }
      },
      'kin.fk': () => ({ tcp_pose: [300, 0, 200, 180, 0, 0], flange_pose: [300, 0, 200, 180, 0, 0] }),
      'dyn.gravity': () => ({ tau_nm: [0, 0, 0, 0, 0, 0], effort_limits_nm: [1, 1, 1, 1, 1, 1], utilization: [0, 0, 0, 0, 0, 0], over_limit: [] }),
      'real.connect': () => snapshot,
      'real.read_settings': () => {
        calledMethods.push('real.read_settings')
        return snapshot
      },
      'tcp.set': () => ({ ok: true }),
      'payload.set': () => ({ ok: true }),
    }

    await useEngineStore().connect(
      async () => ({ port: 1, token: 't' }),
      () => new RpcClient(() => (ws = new FakeWs(handlers))),
    )
    await useRobotStore().load('xarm6_1305')
    const real = useRealStore()
    await real.connect('192.168.1.60')
    await flushPromises()
    calledMethods.length = 0

    snapshot = {
      ...snapshot,
      collision_sensitivity: 5,
    }

    const wrapper = mount(StageRealInfo, { global: { plugins: [i18n] } })
    await wrapper.find('[data-test="stage-real-refresh"]').trigger('click')
    await flushPromises()

    expect(calledMethods).toEqual(['real.read_settings'])
    expect(wrapper.find('[data-test="real-info-sensitivity"]').text()).toBe('5')

    ws.push('real.state', {
      ...snapshot,
      tcp_offset: [1, 2, 195.5, 0, 0, 15],
      payload: { mass_kg: 1.25, com_mm: [1, -2, 60] },
    })
    await flushPromises()
    await flushPromises()

    expect(ws.sent.map((c) => c.method)).toContain('payload.set')
    expect(useRobotStore().payload.mass_kg).toBe(1.25)
    expect(wrapper.find('[data-test="real-info-mass"]').text()).toBe('1.250')
    expect(wrapper.find('[data-test="real-info-tcp-z"]').text()).toBe('195.50')
    expect(ws.sent.some((c) => c.method.startsWith('real.set_'))).toBe(false)
  })
})
