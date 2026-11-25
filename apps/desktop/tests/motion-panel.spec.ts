import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import MotionPanel from '../src/components/MotionPanel.vue'
import StageNotices from '../src/components/StageNotices.vue'
import { useEngineStore } from '../src/stores/engine'
import { useRobotStore } from '../src/stores/robot'
import { useMotionStore } from '../src/stores/motion'
import { RpcClient } from '../src/rpc/client'
import { FakeWs, HELLO } from './fakeEngine'
import { i18n } from '../src/i18n'
import { STATE } from '../src/lib/motion'

const ROBOTS: Record<string, { dof: number; limits: [number, number][] }> = {
  uf850: {
    dof: 6,
    limits: [[-360, 360], [-132, 132], [-242, 3.5], [-360, 360], [-124, 124], [-360, 360]],
  },
  xarm5_1305: {
    dof: 5,
    limits: [[-360, 360], [-118, 120], [-225, 11], [-97, 180], [-360, 360]],
  },
}

describe('MotionPanel & StageNotices', () => {
  beforeEach(async () => {
    localStorage.clear()
    i18n.global.locale.value = 'zh'
    setActivePinia(createPinia())
    const handlers = {
      'system.hello': () => HELLO,
      'robot.load': (p: Record<string, unknown>) => {
        const key = String(p.robot ?? 'uf850')
        const spec = ROBOTS[key] ?? ROBOTS.uf850
        return {
          key,
          robot_name: key,
          dof: spec.dof,
          session_id: `s-${key}`,
          joint_names: Array.from({ length: spec.dof }, (_, i) => `joint${i + 1}`),
          effort_limits_nm: Array(spec.dof).fill(10),
          visual_urdf_relpath: 'x.urdf',
          home_q_deg: Array(spec.dof).fill(0),
          end_effectors: ['none'],
          limits_deg: spec.limits,
          default_q_deg: Array(spec.dof).fill(0),
          end_effector: 'none',
          default_tcp_offset: [0, 0, 0, 0, 0, 0],
          default_tcp_source: 'none',
        }
      },
      'tcp.set': () => ({ ok: true }),
      'payload.set': () => ({ ok: true }),
      'kin.fk': () => ({ tcp_pose: [300, 0, 200, 180, 0, 0], flange_pose: [300, 0, 200, 180, 0, 0] }),
      'dyn.gravity': () => ({ tau_nm: [], effort_limits_nm: [], utilization: [], over_limit: [] }),
      'motion.jog_tcp': (p: Record<string, unknown>) => {
        const q = [...(p.q_deg as number[])]
        q[0] += Number(p.delta)
        return { q_deg: q, tcp_pose: [301, 0, 200, 180, 0, 0] }
      },
      'motion.align': () => ({ q_deg: [0, 0, 0, 0, 0, 0], tcp_pose: [300, 0, 200, 180, 0, 0] }),
    }
    await useEngineStore().connect(async () => ({ port: 1, token: 't' }), () => new RpcClient(() => new FakeWs(handlers)))
    await useRobotStore().load('uf850')
  })

  it('defaults to Cartesian tab, preserves per-tab collapse state, and stops motion on tab switch / collapse', async () => {
    const wrapper = mount(MotionPanel, { attachTo: document.body, global: { plugins: [i18n] } })
    const motion = useMotionStore()
    const stopSpy = vi.spyOn(motion, 'stop')

    expect(wrapper.find('[data-test="tab-cartesian"]').attributes('aria-selected')).toBe('true')
    expect(wrapper.find('[data-test="tab-joint"]').attributes('aria-selected')).toBe('false')
    expect(wrapper.find('#pose-panel').isVisible()).toBe(true)
    expect(wrapper.find('#joint-panel').isVisible()).toBe(false)

    // Collapse Cartesian tab
    await wrapper.find('[data-test="motion-collapse"]').trigger('click')
    expect(stopSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-test="motion-collapse"]').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('#pose-panel').isVisible()).toBe(false)
    expect(wrapper.find('#motion-speed').isVisible()).toBe(false)

    // Switch to Joint tab -> expanded independently
    await wrapper.find('[data-test="tab-joint"]').trigger('click')
    expect(stopSpy).toHaveBeenCalledTimes(2)
    expect(wrapper.find('#joint-panel').isVisible()).toBe(true)
    expect(wrapper.find('#motion-speed').isVisible()).toBe(true)
    expect(wrapper.find('[data-test="motion-collapse"]').attributes('aria-expanded')).toBe('true')

    // Switch back to Cartesian -> still collapsed
    await wrapper.find('[data-test="tab-cartesian"]').trigger('click')
    expect(wrapper.find('[data-test="motion-collapse"]').attributes('aria-expanded')).toBe('false')
    expect(wrapper.find('#pose-panel').isVisible()).toBe(false)
    wrapper.unmount()
  })

  it('persists shared speed slider across tabs and updates readout', async () => {
    const wrapper = mount(MotionPanel, { global: { plugins: [i18n] } })
    const slider = wrapper.find('[data-test="speed"]')
    await slider.setValue('73')
    await slider.trigger('input')
    expect(wrapper.find('[data-test="speed-readout"]').text()).toBe('73%')
    expect(useMotionStore().speed).toBe(73)
  })

  it('disables Roll+/- for 5-DoF xarm5_1305 and enables them for 6-DoF uf850', async () => {
    const wrapper = mount(MotionPanel, { global: { plugins: [i18n] } })
    expect(wrapper.find('[data-test="roll+"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-test="roll-"]').attributes('disabled')).toBeUndefined()

    await useRobotStore().load('xarm5_1305')
    await flushPromises()
    expect(wrapper.find('[data-test="roll+"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="roll-"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="pitch+"]').attributes('disabled')).toBeUndefined()
  })

  it('supports keyboard Enter/Space single step on Cartesian buttons', async () => {
    const wrapper = mount(MotionPanel, { global: { plugins: [i18n] } })
    const robot = useRobotStore()
    await wrapper.find('[data-test="x+"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    expect(robot.q[0]).toBe(1)
    expect(useMotionStore().state).toBe(STATE.stopped)
  })

  it('renders read-only joint rows with bidirectional zero-centered progress bars and steps via -/+ buttons', async () => {
    const wrapper = mount(MotionPanel, { global: { plugins: [i18n] } })
    await wrapper.find('[data-test="tab-joint"]').trigger('click')
    expect(wrapper.findAll('.joint-row')).toHaveLength(6)
    expect(wrapper.findAll('#joint-panel input')).toHaveLength(0)

    const bar = wrapper.findAll('#joint-panel [role="progressbar"]')[0]
    expect(bar.attributes('aria-valuenow')).toBe('0.00')

    await wrapper.find('[data-test="j1+"]').trigger('keydown', { key: ' ' })
    await flushPromises()
    expect(useRobotStore().q[0]).toBe(1)
    expect(wrapper.findAll('#joint-panel [role="progressbar"]')[0].attributes('aria-valuenow')).toBe('1.00')
  })

  it('StageNotices displays live-translated non-blocking alerts and dismisses cleanly', async () => {
    const motion = useMotionStore()
    motion.notice = { kind: 'boundary', axis: 'J2', side: 'max', limit: '10.0°' }
    const wrapper = mount(StageNotices, { global: { plugins: [i18n] } })
    expect(wrapper.find('[data-test="motion-notice-text"]').text()).toContain('J2')
    expect(wrapper.find('[data-test="motion-notice-text"]').text()).toContain('安全边界')

    i18n.global.locale.value = 'en'
    await flushPromises()
    expect(wrapper.find('[data-test="motion-notice-text"]').text()).toContain('safety boundary')

    await wrapper.find('[data-test="dismiss-motion-notice"]').trigger('click')
    expect(motion.notice).toBeNull()
    expect(wrapper.find('[data-test="motion-notice"]').exists()).toBe(false)
  })
})
