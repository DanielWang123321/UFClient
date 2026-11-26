// Parameter specifications & 3D URDF drive-joint mappings for controllable grippers.
export type SupportedGripper = 'robotiq_2f_85' | 'robotiq_2f_140' | 'gripper_g2' | 'bio_gripper_g2'

export interface GripperAxisSpec {
  min: number
  max: number
  step: number
  default: number
  unit: string
}

export interface GripperPosSpec extends GripperAxisSpec {
  open: number
  close: number
}

export interface GripperSpec {
  pos: GripperPosSpec
  speed: GripperAxisSpec
  force: GripperAxisSpec
  urdfDrive: {
    joint: string
    openValue: number
    closeValue: number
  }
}

export interface GripperState {
  pos: number
  speed: number
  force: number
}

export const GRIPPER_SPECS: Record<SupportedGripper, GripperSpec> = {
  robotiq_2f_85: {
    pos: { min: 0, max: 255, step: 1, default: 0, open: 0, close: 255, unit: '' },
    speed: { min: 0, max: 255, step: 1, default: 128, unit: '' },
    force: { min: 0, max: 255, step: 1, default: 128, unit: '' },
    urdfDrive: {
      joint: 'robotiq_2f_85_drive_joint',
      openValue: 0.0,
      closeValue: 0.8014334346423151,
    },
  },
  robotiq_2f_140: {
    pos: { min: 0, max: 255, step: 1, default: 0, open: 0, close: 255, unit: '' },
    speed: { min: 0, max: 255, step: 1, default: 128, unit: '' },
    force: { min: 0, max: 255, step: 1, default: 128, unit: '' },
    urdfDrive: {
      joint: 'robotiq_2f_140_drive_joint',
      openValue: 0.0038593285902723817,
      closeValue: 0.7665940156296729,
    },
  },
  gripper_g2: {
    pos: { min: 0, max: 84, step: 1, default: 84, open: 84, close: 0, unit: 'mm' },
    speed: { min: 15, max: 225, step: 1, default: 100, unit: 'mm/s' },
    force: { min: 1, max: 100, step: 1, default: 50, unit: '%' },
    urdfDrive: {
      joint: 'drive_joint',
      openValue: 0.057210812728026743,
      closeValue: 0.86509464599328212,
    },
  },
  bio_gripper_g2: {
    pos: { min: 71, max: 150, step: 1, default: 150, open: 150, close: 71, unit: 'mm' },
    speed: { min: 500, max: 4000, step: 100, default: 2000, unit: 'pulse/s' },
    force: { min: 1, max: 100, step: 1, default: 50, unit: '%' },
    urdfDrive: {
      joint: 'bio_gripper_g2_right_finger_joint',
      openValue: 0.0395,
      closeValue: 0.0,
    },
  },
}

export function isControllableGripper(ee: string): ee is SupportedGripper {
  return Object.prototype.hasOwnProperty.call(GRIPPER_SPECS, ee)
}

export function createDefaultGripperStates(): Record<SupportedGripper, GripperState> {
  return {
    robotiq_2f_85: {
      pos: GRIPPER_SPECS.robotiq_2f_85.pos.default,
      speed: GRIPPER_SPECS.robotiq_2f_85.speed.default,
      force: GRIPPER_SPECS.robotiq_2f_85.force.default,
    },
    robotiq_2f_140: {
      pos: GRIPPER_SPECS.robotiq_2f_140.pos.default,
      speed: GRIPPER_SPECS.robotiq_2f_140.speed.default,
      force: GRIPPER_SPECS.robotiq_2f_140.force.default,
    },
    gripper_g2: {
      pos: GRIPPER_SPECS.gripper_g2.pos.default,
      speed: GRIPPER_SPECS.gripper_g2.speed.default,
      force: GRIPPER_SPECS.gripper_g2.force.default,
    },
    bio_gripper_g2: {
      pos: GRIPPER_SPECS.bio_gripper_g2.pos.default,
      speed: GRIPPER_SPECS.bio_gripper_g2.speed.default,
      force: GRIPPER_SPECS.bio_gripper_g2.force.default,
    },
  }
}

export function clampGripperValue(axis: GripperAxisSpec, raw: number): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return axis.default
  return Math.round(Math.min(axis.max, Math.max(axis.min, n)))
}

/** Map UI position parameter to the corresponding URDF drive joint value (rad for linkage grippers, m for BIO G2). */
export function gripperPosToDriveValue(ee: SupportedGripper, pos: number): number {
  const spec = GRIPPER_SPECS[ee]
  const clamped = clampGripperValue(spec.pos, pos)
  const span = spec.pos.close - spec.pos.open
  if (span === 0) return spec.urdfDrive.openValue
  const ratioClosed = (clamped - spec.pos.open) / span
  return spec.urdfDrive.openValue + ratioClosed * (spec.urdfDrive.closeValue - spec.urdfDrive.openValue)
}
