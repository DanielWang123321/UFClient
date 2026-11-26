import { describe, expect, it } from 'vitest'
import { VIEW_FIT, computeArmReach } from '../src/three/SceneController'

describe('default camera framing', () => {
  it('uses tighter VIEW_FIT (~0.9) for 50% larger default robot framing', () => {
    expect(VIEW_FIT).toBeCloseTo(0.9, 5)
  })
})

const vec = (len: number) => ({ position: { length: () => len } })

describe('SceneController arm framing reach calculation', () => {
  it('computes identical arm reach regardless of extra end-effector or adapter joints', () => {
    const bareArm = {
      world_joint: vec(0),
      joint1: vec(0.267),
      joint2: vec(0),
      joint3: vec(0.29),
      joint4: vec(0.351),
      joint5: vec(0),
      joint6: vec(0.122),
      joint_eef: vec(0),
    }

    const withRobotiq = {
      ...bareArm,
      robotiq_mounting_tool_mount_joint: vec(0.011),
      robotiq_mounting_robotiq_hole_0_joint: vec(0.033),
      robotiq_2f_85_fix: vec(0.011),
      robotiq_2f_85_drive_joint: vec(0.063),
      robotiq_2f_85_left_finger_joint: vec(0.057),
      robotiq_2f_85_right_finger_joint: vec(0.057),
      robotiq_2f_85_tcp_joint: vec(0.162),
    }

    const armJoints = ['joint1', 'joint2', 'joint3', 'joint4', 'joint5', 'joint6']
    const reachBare = computeArmReach(bareArm, armJoints)
    const reachRobotiq = computeArmReach(withRobotiq, armJoints)

    expect(reachBare).toBeCloseTo(1.03, 6)
    expect(reachRobotiq).toBeCloseTo(reachBare, 10)
  })

  it('falls back to all joints when armJointNames is omitted or unmatched', () => {
    const joints = { a: vec(0.4), b: vec(0.6) }
    expect(computeArmReach(joints)).toBeCloseTo(1.0, 6)
    expect(computeArmReach(joints, ['missing'])).toBeCloseTo(1.0, 6)
  })
})
