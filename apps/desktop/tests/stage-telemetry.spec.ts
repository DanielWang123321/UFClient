import { beforeEach, describe, expect, it } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import StageTelemetry from '../src/components/StageTelemetry.vue'
import { useRobotStore } from '../src/stores/robot'
import { i18n } from '../src/i18n'

describe('StageTelemetry collapse toggle', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'zh'
    setActivePinia(createPinia())
    const robot = useRobotStore()
    robot.q = [10, -20, -30, 0, 50, 15]
    robot.fk = {
      tcp_pose: [320, 10, 250, 180, 0, 0],
      flange_pose: [320, 10, 250, 180, 0, 0],
    }
    robot.payload = { mass_kg: 1.5, com_mm: [0, 0, 35] }
  })

  it('starts expanded and toggles cleanly between expanded and collapsed states', async () => {
    const wrapper = mount(StageTelemetry, { attachTo: document.body, global: { plugins: [i18n] } })
    const toggle = wrapper.find('[data-test="telemetry-collapse"]')
    const body = wrapper.find('[data-test="telemetry-body"]')

    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.attributes('data-chevron')).toBe('up')
    expect(body.isVisible()).toBe(true)
    expect(wrapper.find('[data-test="info-panel"]').classes()).not.toContain('is-collapsed')
    expect(wrapper.find('[data-test="q1"]').text()).toBe('10.00')

    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('data-chevron')).toBe('down')
    expect(body.isVisible()).toBe(false)
    expect(wrapper.find('[data-test="info-panel"]').classes()).toContain('is-collapsed')
    expect(wrapper.find('.telemetry-bar-title').text()).toBe('位姿与关节')

    // Language switch updates collapsed title and aria-label live
    i18n.global.locale.value = 'en'
    await flushPromises()
    expect(wrapper.find('.telemetry-bar-title').text()).toBe('Pose & joints')
    expect(toggle.attributes('aria-label')).toContain('Expand')

    // Click again restores expanded view
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(body.isVisible()).toBe(true)
    wrapper.unmount()
  })

  it('renders joint cells matching 5/6/7 DOF arms', async () => {
    const robot = useRobotStore()
    robot.q = [1, 2, 3, 4, 5]
    const wrapper = mount(StageTelemetry, { global: { plugins: [i18n] } })
    expect(wrapper.find('[data-test="q5"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="q6"]').exists()).toBe(false)

    robot.q = [1, 2, 3, 4, 5, 6, 7]
    await flushPromises()
    expect(wrapper.find('[data-test="q7"]').exists()).toBe(true)
  })
})
