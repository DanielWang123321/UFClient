import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import App from '../src/App.vue'
import AppHeader from '../src/components/AppHeader.vue'
import AppNavRail from '../src/components/AppNavRail.vue'
import FeaturePlaceholderView from '../src/views/FeaturePlaceholderView.vue'
import { useEngineStore } from '../src/stores/engine'
import { useMotionStore } from '../src/stores/motion'
import { i18n } from '../src/i18n'

describe('AppNavRail & workspace shell navigation', () => {
  beforeEach(() => {
    localStorage.clear()
    i18n.global.locale.value = 'en'
    setActivePinia(createPinia())
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders Live Control, Blockly, Python, GCode and bottom-left Settings with active state and locale switch', async () => {
    const wrapper = mount(AppNavRail, {
      props: { active: 'live' },
      global: { plugins: [i18n] },
    })

    expect(wrapper.find('[data-test="nav-live"]').classes()).toContain('active')
    expect(wrapper.find('[data-test="nav-live"]').attributes('aria-current')).toBe('page')
    expect(wrapper.find('[data-test="nav-blockly"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="nav-python"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="nav-gcode"]').exists()).toBe(true)
    expect(wrapper.find('.rail-bottom [data-test="nav-settings"]').exists()).toBe(true)

    await wrapper.find('[data-test="nav-blockly"]').trigger('click')
    await wrapper.find('[data-test="nav-settings"]').trigger('click')
    expect(wrapper.emitted('select')).toEqual([['blockly'], ['settings']])

    i18n.global.locale.value = 'zh'
    await flushPromises()
    expect(wrapper.find('[data-test="nav-live"]').text()).toContain('实时控制')
    expect(wrapper.find('[data-test="nav-settings"]').text()).toContain('设置')
  })

  it('renders localized FeaturePlaceholderView for Blockly, Python and GCode', async () => {
    const w = mount(FeaturePlaceholderView, {
      props: { feature: 'blockly' },
      global: { plugins: [i18n] },
    })
    expect(w.find('[data-test="feature-placeholder"]').attributes('data-feature')).toBe('blockly')
    expect(w.text()).toContain('Blockly')
    expect(w.text()).toContain('Planned')

    await w.setProps({ feature: 'gcode' })
    expect(w.find('[data-test="feature-placeholder"]').attributes('data-feature')).toBe('gcode')
    expect(w.text()).toContain('G-Code')
  })

  it('removes Settings button from AppHeader while keeping STOP and language switcher', () => {
    const hdr = mount(AppHeader, { global: { plugins: [i18n] } })
    expect(hdr.find('[data-test="settings"]').exists()).toBe(false)
    expect(hdr.find('[data-test="stop"]').exists()).toBe(true)
    expect(hdr.find('[data-test="lang-switch"]').exists()).toBe(true)
  })

  it('switches pages via AppNavRail, toggles Settings bottom-left, preserves CheckView via v-show, and stops motion', async () => {
    const engine = useEngineStore()
    vi.spyOn(engine, 'connect').mockResolvedValue(false)
    const motion = useMotionStore()
    const stopSpy = vi.spyOn(motion, 'stop')

    const app = mount(App, {
      attachTo: document.body,
      global: {
        plugins: [i18n],
        stubs: {
          CheckView: { template: '<div data-test="stub-check-view" />' },
        },
      },
    })
    await flushPromises()

    const checkEl = app.find('[data-test="stub-check-view"]')
    expect(checkEl.isVisible()).toBe(true)

    // Switch to Blockly placeholder -> CheckView stays mounted (hidden via v-show)
    await app.find('[data-test="nav-blockly"]').trigger('click')
    expect(app.find('[data-test="feature-placeholder"]').attributes('data-feature')).toBe('blockly')
    expect(checkEl.exists()).toBe(true)
    expect(checkEl.isVisible()).toBe(false)

    // Click bottom-left Settings -> opens SettingsView; clicking again returns to Blockly
    await app.find('[data-test="nav-settings"]').trigger('click')
    expect(app.find('[data-test="settings-view"]').exists()).toBe(true)

    await app.find('[data-test="nav-settings"]').trigger('click')
    expect(app.find('[data-test="settings-view"]').exists()).toBe(false)
    expect(app.find('[data-test="feature-placeholder"]').attributes('data-feature')).toBe('blockly')

    // Back to Live Control -> CheckView becomes visible again without remounting
    await app.find('[data-test="nav-live"]').trigger('click')
    expect(checkEl.isVisible()).toBe(true)
    expect(stopSpy).toHaveBeenCalledTimes(4)

    app.unmount()
  })
})
