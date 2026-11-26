import { beforeEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

import AppHeader from '../src/components/AppHeader.vue'
import RobotPanel from '../src/components/RobotPanel.vue'
import {
  GRIPPER_SPECS,
  gripperDriveRatePerSec,
  gripperPosToDriveValue,
  gripperSpeedMmPerSec,
  stepGripperValue,
  type SupportedGripper,
} from '../src/lib/gripper'
import { i18n } from '../src/i18n'
import { RpcClient } from '../src/rpc/client'
import type { RealStatus } from '../src/rpc/types'
import { useEngineStore } from '../src/stores/engine'
import { useRealStore } from '../src/stores/real'
import { useRobotStore } from '../src/stores/robot'
import { DEFAULT_REAL_IP } from '../src/stores/settings'
import { FakeWs, HELLO } from './fakeEngine'

function makeLoad(key = 'xarm6_1305', ee = 'none') {
  return {
    key,
    robot_name: key,
    dof: 6,
    session_id: `s-${key}-${ee}`,
    joint_names: ['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6'],
    effort_limits_nm: [179.4, 179.4, 92, 81.5, 30.6, 30.6],
    visual_urdf_relpath: `urdf/composed/${key}__${ee}__glb.urdf`,
    home_q_deg: [0, 0, 0, 0, 0, 0],
    end_effectors: ['none', 'robotiq_2f_85', 'robotiq_2f_140', 'gripper_g2', 'bio_gripper_g2', 'vacuum_gripper'],
    limits_deg: [
      [-360, 360],
      [-118, 120],
      [-225, 11],
      [-360, 360],
      [-97, 180],
      [-360, 360],
    ] as [number, number][],
    default_q_deg: [0, 0, 0, 0, 0, 0],
    end_effector: ee,
    default_tcp_offset: [0, 0, 173, 0, 0, 0],
    default_tcp_source: 'test',
  }
}

function makeRealSnap(overrides: Partial<RealStatus> = {}): RealStatus {
  return {
    connected: true,
    ip: DEFAULT_REAL_IP,
    robot_key: 'xarm6_1305',
    dof: 6,
    version: '6,6,XI1305,AC1310,v2.8.2',
    sn: 'XI1305060001',
    state: 2,
    mode: 0,
    error_code: 0,
    warn_code: 0,
    enabled: true,
    is_simulation_robot: false,
    q_deg: [0, 0, 0, 0, 0, 0],
    tcp_pose: [350, 0, 220, 180, 0, 0],
    tcp_offset: [0, 0, 173, 0, 0, 0],
    payload: { mass_kg: 1.0, com_mm: [0, 0, 40] },
    collision_sensitivity: 3,
    world_offset: [0, 0, 0, 0, 0, 0],
    gravity_direction: [0, 0, -1],
    mount_direction: [0, 0],
    initial_point: [0, 0, 0, 0, 0, 0],
    ...overrides,
  }
}

describe('AppHeader, gripper kinematics & RobotPanel controls', () => {
  let ws: FakeWs

  beforeEach(async () => {
    localStorage.clear()
    i18n.global.locale.value = 'zh'
    setActivePinia(createPinia())

    const handlers = {
      'system.hello': () => HELLO,
      'robot.load': (p: Record<string, unknown>) =>
        makeLoad(String(p.robot ?? 'xarm6_1305'), String(p.end_effector ?? 'none')),
      'tcp.set': () => ({ ok: true }),
      'payload.set': () => ({ ok: true }),
      'kin.fk': () => ({ tcp_pose: [300, 0, 200, 180, 0, 0], flange_pose: [300, 0, 200, 180, 0, 0] }),
      'dyn.gravity': () => ({
        tau_nm: [0, 0, 0, 0, 0, 0],
        effort_limits_nm: [1, 1, 1, 1, 1, 1],
        utilization: [0, 0, 0, 0, 0, 0],
        over_limit: [],
      }),
      'real.connect': () => makeRealSnap(),
      'real.read_settings': () => makeRealSnap(),
      'real.gripper_enable': (p: Record<string, unknown>) => ({
        ok: true,
        gripper: String(p.gripper),
        enabled: true,
        pos: p.gripper === 'bio_gripper_g2' ? 120 : p.gripper === 'gripper_g2' ? 42 : 64,
      }),
      'real.gripper_move': (p: Record<string, unknown>) => ({
        ok: true,
        gripper: String(p.gripper),
        pos: Number(p.pos),
        speed: Number(p.speed),
        force: Number(p.force),
      }),
    }

    await useEngineStore().connect(
      async () => ({ port: 1, token: 't' }),
      () => new RpcClient(() => (ws = new FakeWs(handlers))),
    )
    await useRobotStore().load('xarm6_1305', 'none')
  })

  it('renders UFClient logo, centers RealRobotControl, and omits sim-state pill in AppHeader', () => {
    const header = mount(AppHeader, { global: { plugins: [i18n] } })
    expect(header.find('[data-test="app-logo"]').text()).toBe('UFClient')
    expect(header.find('[data-test="header-center"] [data-test="real-trigger"]').exists()).toBe(true)
    expect(header.find('.header-right [data-test="real-trigger"]').exists()).toBe(false)
    expect(header.find('[data-test="sim-state"]').exists()).toBe(false)
    expect(header.find('.sim-pill').exists()).toBe(false)
    expect(header.find('.sim-dot').exists()).toBe(false)
    header.unmount()
  })

  it('maps open, mid, and close positions to URDF drive joint values for all 4 grippers', () => {
    const cases: SupportedGripper[] = ['robotiq_2f_85', 'robotiq_2f_140', 'gripper_g2', 'bio_gripper_g2']
    for (const ee of cases) {
      const spec = GRIPPER_SPECS[ee]
      expect(gripperPosToDriveValue(ee, spec.pos.open)).toBeCloseTo(spec.urdfDrive.openValue, 6)
      expect(gripperPosToDriveValue(ee, spec.pos.close)).toBeCloseTo(spec.urdfDrive.closeValue, 6)
      const midPos = Math.round((spec.pos.open + spec.pos.close) / 2)
      const ratio = (midPos - spec.pos.open) / (spec.pos.close - spec.pos.open)
      const expectedMid = spec.urdfDrive.openValue + ratio * (spec.urdfDrive.closeValue - spec.urdfDrive.openValue)
      expect(gripperPosToDriveValue(ee, midPos)).toBeCloseTo(expectedMid, 6)
    }
  })

  it('shows position, speed, and force controls only for supported grippers with collapsible tuning', async () => {
    const robot = useRobotStore()
    const wrapper = mount(RobotPanel, { attachTo: document.body, global: { plugins: [i18n] } })

    expect(wrapper.find('[data-test="gripper-ctrl"]').exists()).toBe(false)

    await robot.select('xarm6_1305', 'vacuum_gripper')
    await flushPromises()
    expect(wrapper.find('[data-test="gripper-ctrl"]').exists()).toBe(false)

    const supported: SupportedGripper[] = ['robotiq_2f_85', 'robotiq_2f_140', 'gripper_g2', 'bio_gripper_g2']
    for (const ee of supported) {
      await robot.select('xarm6_1305', ee)
      await flushPromises()
      const spec = GRIPPER_SPECS[ee]
      const ctrl = wrapper.find('[data-test="gripper-ctrl"]')
      expect(ctrl.exists()).toBe(true)

      const posInput = wrapper.find('[data-test="gripper-pos-input"]')
      expect(posInput.attributes('min')).toBe(String(spec.pos.min))
      expect(posInput.attributes('max')).toBe(String(spec.pos.max))

      const toggle = wrapper.find('[data-test="gripper-tuning-toggle"]')
      const tuning = wrapper.find('[data-test="gripper-tuning-panel"]')
      expect(toggle.attributes('aria-expanded')).toBe('false')
      expect(tuning.isVisible()).toBe(false)

      await toggle.trigger('click')
      expect(toggle.attributes('aria-expanded')).toBe('true')
      expect(tuning.isVisible()).toBe(true)

      const speedInput = wrapper.find('[data-test="gripper-speed-input"]')
      const forceInput = wrapper.find('[data-test="gripper-force-input"]')
      expect(speedInput.attributes('min')).toBe(String(spec.speed.min))
      expect(speedInput.attributes('max')).toBe(String(spec.speed.max))
      expect(forceInput.attributes('min')).toBe(String(spec.force.min))
      expect(forceInput.attributes('max')).toBe(String(spec.force.max))

      // Reset collapsed state before checking the next gripper
      await toggle.trigger('click')
      expect(tuning.isVisible()).toBe(false)
    }

    wrapper.unmount()
  })

  it('updates gripper state in simulation without real.* calls and dispatches real gripper RPCs when connected', async () => {
    const robot = useRobotStore()
    const real = useRealStore()
    await robot.select('xarm6_1305', 'robotiq_2f_85')

    const wrapper = mount(RobotPanel, { attachTo: document.body, global: { plugins: [i18n] } })
    await wrapper.find('[data-test="gripper-tuning-toggle"]').trigger('click')

    // Simulation mode: open/close, clamping, speed/force updates trigger zero real.* RPCs
    await wrapper.find('[data-test="gripper-close"]').trigger('click')
    expect(robot.gripperStates.robotiq_2f_85.pos).toBe(255)

    await wrapper.find('[data-test="gripper-open"]').trigger('click')
    expect(robot.gripperStates.robotiq_2f_85.pos).toBe(0)

    await wrapper.find('[data-test="gripper-pos-input"]').setValue('300')
    expect(robot.gripperStates.robotiq_2f_85.pos).toBe(255)

    await wrapper.find('[data-test="gripper-speed-input"]').setValue('200')
    await wrapper.find('[data-test="gripper-force-input"]').setValue('180')
    expect(robot.gripperStates.robotiq_2f_85.speed).toBe(200)
    expect(robot.gripperStates.robotiq_2f_85.force).toBe(180)
    expect(ws.sent.some((c) => c.method.startsWith('real.'))).toBe(false)
    expect(wrapper.find('[data-test="gripper-enable"]').exists()).toBe(false)

    // Real mode: enable & commit actions send real.gripper_enable / real.gripper_move
    await real.connect('192.168.1.60')
    await robot.select('xarm6_1305', 'gripper_g2')
    await flushPromises()
    ws.sent.length = 0

    const enableBtn = wrapper.find('[data-test="gripper-enable"]')
    expect(enableBtn.exists()).toBe(true)
    await enableBtn.trigger('click')
    await flushPromises()
    expect(ws.sent.some((c) => c.method === 'real.gripper_enable' && c.params.gripper === 'gripper_g2')).toBe(true)
    expect(robot.gripperStates.gripper_g2.pos).toBe(42)

    // Slider input only updates 3D preview locally; commit sends real.gripper_move once
    const slider = wrapper.find('[data-test="gripper-pos-slider"]')
    await slider.setValue('18')
    await flushPromises()
    expect(robot.gripperStates.gripper_g2.pos).toBe(18)
    expect(ws.sent.filter((c) => c.method === 'real.gripper_move').length).toBe(1)

    await wrapper.find('[data-test="gripper-close"]').trigger('click')
    await flushPromises()
    const lastMove = ws.sent.filter((c) => c.method === 'real.gripper_move').pop()
    expect(lastMove?.params).toMatchObject({ gripper: 'gripper_g2', pos: 0 })

    // Fault locks gripper controls
    real.errorCode = 12
    await flushPromises()
    expect(wrapper.find('[data-test="gripper-open"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-test="gripper-enable"]').attributes('disabled')).toBeDefined()

    wrapper.unmount()
  })

  it('estimates physical gripper speeds and steps 3D drive joint motion smoothly without teleporting', () => {
    const driveSpan = (ee: SupportedGripper) =>
      Math.abs(GRIPPER_SPECS[ee].urdfDrive.closeValue - GRIPPER_SPECS[ee].urdfDrive.openValue)

    // Robotiq 2F-85: 85mm stroke, 20..150 mm/s -> full stroke ~0.567s (255), ~1.0s (128), 4.25s (0)
    expect(gripperSpeedMmPerSec('robotiq_2f_85', 255)).toBeCloseTo(150, 5)
    expect(gripperSpeedMmPerSec('robotiq_2f_85', 0)).toBeCloseTo(20, 5)
    expect(driveSpan('robotiq_2f_85') / gripperDriveRatePerSec('robotiq_2f_85', 255)).toBeCloseTo(85 / 150, 3)
    expect(driveSpan('robotiq_2f_85') / gripperDriveRatePerSec('robotiq_2f_85', 128)).toBeCloseTo(1.0, 1)
    expect(driveSpan('robotiq_2f_85') / gripperDriveRatePerSec('robotiq_2f_85', 0)).toBeCloseTo(4.25, 3)

    // Robotiq 2F-140: 140mm stroke, 30..250 mm/s -> full stroke 0.56s (255), ~4.67s (0)
    expect(driveSpan('robotiq_2f_140') / gripperDriveRatePerSec('robotiq_2f_140', 255)).toBeCloseTo(0.56, 3)
    expect(driveSpan('robotiq_2f_140') / gripperDriveRatePerSec('robotiq_2f_140', 0)).toBeCloseTo(140 / 30, 3)

    // Gripper G2 & BIO Gripper G2 rates scale monotonically with configured speed
    expect(gripperDriveRatePerSec('gripper_g2', 225)).toBeGreaterThan(gripperDriveRatePerSec('gripper_g2', 100))
    expect(gripperDriveRatePerSec('gripper_g2', 100)).toBeGreaterThan(gripperDriveRatePerSec('gripper_g2', 15))
    expect(gripperDriveRatePerSec('bio_gripper_g2', 4000)).toBeGreaterThan(gripperDriveRatePerSec('bio_gripper_g2', 2000))
    expect(gripperDriveRatePerSec('bio_gripper_g2', 2000)).toBeGreaterThan(gripperDriveRatePerSec('bio_gripper_g2', 500))

    // Frame stepper advances gradually, clamps cleanly at target, and supports mid-stroke reversal
    const rate = gripperDriveRatePerSec('robotiq_2f_85', 128)
    const targetClose = GRIPPER_SPECS.robotiq_2f_85.urdfDrive.closeValue
    const targetOpen = GRIPPER_SPECS.robotiq_2f_85.urdfDrive.openValue

    const step1 = stepGripperValue(targetOpen, targetClose, rate, 0.1)
    expect(step1).toBeGreaterThan(targetOpen)
    expect(step1).toBeLessThan(targetClose)
    expect(step1).toBeCloseTo(rate * 0.1, 6)

    const reversed = stepGripperValue(step1, targetOpen, rate, 0.05)
    expect(reversed).toBeGreaterThan(targetOpen)
    expect(reversed).toBeLessThan(step1)
    expect(reversed).toBeCloseTo(step1 - rate * 0.05, 6)

    expect(stepGripperValue(targetOpen, targetClose, rate, 10)).toBe(targetClose)
  })
})
