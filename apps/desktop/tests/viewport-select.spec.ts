import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('../src/three/SceneController', () => ({
  SceneController: class {
    onLoaded: (ok: boolean, err?: unknown) => void = () => {}
    loadUrdf() {}
    setJoints() {}
    setGripperJoint() {}
    animateGripperJoint() {}
    setTcp() {}
    setVisible() {}
    dispose() {}
  },
}))

import Viewport from '../src/components/Viewport.vue'
import { i18n } from '../src/i18n'
import { useRealStore } from '../src/stores/real'
import { useRobotStore } from '../src/stores/robot'

describe('Viewport model selector persistence across disconnect', () => {
  beforeEach(() => {
    localStorage.clear()
    i18n.global.locale.value = 'zh'
    setActivePinia(createPinia())
  })

  it('keeps xarm6_1305 selected in #robot-select after disconnecting from physical robot', async () => {
    const robot = useRobotStore()
    const real = useRealStore()

    robot.robots = [
      { key: 'uf850', robot_name: 'UF850', dof: 6, end_effectors: ['none', 'gripper_g2'] },
      { key: 'xarm6_1305', robot_name: 'xArm 6', dof: 6, end_effectors: ['none', 'gripper_g2'] },
    ]
    robot.key = 'xarm6_1305'

    const wrapper = mount(Viewport, { global: { plugins: [i18n] } })
    expect((wrapper.find('[data-test="robot-select"]').element as HTMLSelectElement).value).toBe('xarm6_1305')

    real.connected = true
    await flushPromises()
    expect(wrapper.find('[data-test="stage-real-info"]').exists()).toBe(true)
    expect((wrapper.find('[data-test="robot-select"]').element as HTMLSelectElement).value).toBe('xarm6_1305')

    real.connected = false
    await flushPromises()
    expect(wrapper.find('[data-test="stage-real-info"]').exists()).toBe(false)
    expect(robot.key).toBe('xarm6_1305')
    expect((wrapper.find('[data-test="robot-select"]').element as HTMLSelectElement).value).toBe('xarm6_1305')

    wrapper.unmount()
  })
})
