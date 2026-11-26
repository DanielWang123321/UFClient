<script setup lang="ts">
// Main 3D stage with top-left model selector, top-center non-blocking notices,
// top-right frosted telemetry, and bottom-right frame/view actions.
import { markRaw, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { SceneController } from '../three/SceneController'
import { robotDisplayName, useRobotStore } from '../stores/robot'
import { useMotionStore } from '../stores/motion'
import { useRealStore } from '../stores/real'
import {
  GRIPPER_SPECS,
  gripperDriveRatePerSec,
  gripperPosToDriveValue,
  isControllableGripper,
} from '../lib/gripper'
import StageTelemetry from './StageTelemetry.vue'
import StageRealInfo from './StageRealInfo.vue'
import StageNotices from './StageNotices.vue'

const robot = useRobotStore()
const motion = useMotionStore()
const real = useRealStore()
const host = ref<HTMLDivElement>()
const state = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const show = ref({ base: true, tcp: true })
let ctl: SceneController | null = null
let loadedRobotKey = ''

function load() {
  if (!ctl || !robot.info) return
  state.value = 'loading'
  const ee = `link${robot.info.dof}`
  const robotChanged = loadedRobotKey !== robot.info.key
  loadedRobotKey = robot.info.key
  ctl.loadUrdf(robot.info.visual_urdf_relpath, ee, {
    armJointNames: robot.info.joint_names,
    resetCamera: robotChanged,
  })
}

async function onSelectModel(e: Event) {
  const nextKey = (e.target as HTMLSelectElement).value
  if (nextKey === robot.key) return
  motion.stop()
  motion.clearNotice()
  const targetSpec = robot.robots.find((r) => r.key === nextKey)
  const compatibleEe = targetSpec?.end_effectors.includes(robot.endEffector) ? robot.endEffector : 'none'
  await robot.select(nextKey, compatibleEe)
}

function syncGripper(immediate = false) {
  if (!ctl || !isControllableGripper(robot.endEffector)) return
  const ee = robot.endEffector
  const stateVal = robot.gripperStates[ee]
  const targetVal = gripperPosToDriveValue(ee, stateVal.pos)
  const joint = GRIPPER_SPECS[ee].urdfDrive.joint
  if (immediate) {
    ctl.setGripperJoint(joint, targetVal)
  } else {
    ctl.animateGripperJoint(joint, targetVal, gripperDriveRatePerSec(ee, stateVal.speed))
  }
}

onMounted(() => {
  ctl = markRaw(new SceneController(host.value!))
  ctl.onLoaded = (ok) => {
    state.value = ok ? 'ready' : 'error'
    if (ok && ctl && robot.info) {
      ctl.setJoints(robot.info.joint_names, robot.q)
      ctl.setTcp(robot.tcpOffset)
      syncGripper(true)
      ctl.setVisible('base', show.value.base)
      ctl.setVisible('tcp', show.value.tcp)
    }
  }
  ;(window as unknown as { __ugclientScene?: SceneController }).__ugclientScene = ctl
  load()
})

onBeforeUnmount(() => {
  ctl?.dispose()
  ctl = null
  loadedRobotKey = ''
})

watch(() => robot.info?.visual_urdf_relpath, load)
watch(
  () => [...robot.q],
  (q) => robot.info && ctl?.setJoints(robot.info.joint_names, q),
)
watch(
  [
    () => robot.endEffector,
    () => (isControllableGripper(robot.endEffector) ? robot.gripperStates[robot.endEffector].pos : null),
    () => (isControllableGripper(robot.endEffector) ? robot.gripperStates[robot.endEffector].speed : null),
  ],
  () => syncGripper(false),
)
watch(() => robot.tcpOffset, (o) => ctl?.setTcp(o))
watch(show, (s) => {
  ctl?.setVisible('base', s.base)
  ctl?.setVisible('tcp', s.tcp)
}, { deep: true })
</script>

<template>
  <div class="stage">
    <div ref="host" class="canvas-area" data-test="viewport"></div>

    <div class="stage-top">
      <StageRealInfo v-if="real.connected">
        <template #model>
          <label class="visually-hidden" for="robot-select">{{ $t('robot.model') }}</label>
          <select
            id="robot-select" class="in-real-card" :value="robot.key"
            :disabled="robot.robots.length === 0 || real.connected"
            :title="$t('robot.lockedReal')"
            data-test="robot-select" @change="onSelectModel"
          >
            <option v-if="robot.robots.length === 0" :value="robot.key">{{ robotDisplayName(robot.key) }}</option>
            <option v-for="r in robot.robots" :key="r.key" :value="r.key">
              {{ robotDisplayName(r.key, r.robot_name) }}
            </option>
          </select>
        </template>
      </StageRealInfo>
      <div v-else class="robot-models">
        <label class="visually-hidden" for="robot-select">{{ $t('robot.model') }}</label>
        <select
          id="robot-select" :value="robot.key" :disabled="robot.robots.length === 0 || real.connected"
          :title="real.connected ? $t('robot.lockedReal') : undefined"
          data-test="robot-select" @change="onSelectModel"
        >
          <option v-if="robot.robots.length === 0" :value="robot.key">{{ robotDisplayName(robot.key) }}</option>
          <option v-for="r in robot.robots" :key="r.key" :value="r.key">
            {{ robotDisplayName(r.key, r.robot_name) }}
          </option>
        </select>
      </div>
      <StageTelemetry />
    </div>

    <StageNotices :load-failed="state === 'error'" @retry="load()" />

    <div v-if="state === 'loading'" class="load-overlay" role="status">
      <span class="spinner"></span>
      <span>{{ $t('view.loading') }}</span>
    </div>

    <div class="stage-bottom">
      <div class="stage-actions" data-test="view-toolbar">
        <button
          type="button" class="stage-btn" :aria-pressed="show.base"
          data-test="view-base" @click="show.base = !show.base"
        >
          <svg class="axes-icon" viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
            <path d="M2.5 16.2h13" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            <path d="M5.2 16.2l0.9-3h5.8l0.9 3" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.25" stroke-linejoin="round" />
            <path d="M9 11.4L3 8.8" stroke="#e53935" stroke-width="1.65" stroke-linecap="round" />
            <path d="M9 11.4L15 8.8" stroke="#2ea043" stroke-width="1.65" stroke-linecap="round" />
            <path d="M9 11.4V2.4M7.3 4.2L9 2.2l1.7 2" fill="none" stroke="#2574e8" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="9" cy="11.4" r="1.25" fill="currentColor" />
          </svg>
          <span>{{ $t('view.base') }}</span>
        </button>

        <button
          type="button" class="stage-btn" :aria-pressed="show.tcp"
          data-test="view-tcp" @click="show.tcp = !show.tcp"
        >
          <svg class="axes-icon" viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
            <path d="M7.2 1.6v2.1M10.8 1.6v2.1" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
            <ellipse cx="9" cy="4.9" rx="4.6" ry="1.65" fill="currentColor" fill-opacity="0.22" stroke="currentColor" stroke-width="1.25" />
            <path d="M9 6.8L3 9.4" stroke="#e53935" stroke-width="1.65" stroke-linecap="round" />
            <path d="M9 6.8L15 9.4" stroke="#2ea043" stroke-width="1.65" stroke-linecap="round" />
            <path d="M9 6.8v9M7.3 14L9 16l1.7-2" fill="none" stroke="#2574e8" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="9" cy="6.8" r="1.25" fill="currentColor" />
          </svg>
          <span>{{ $t('view.tcp') }}</span>
        </button>

        <button
          type="button" class="stage-btn view-reset" :title="$t('view.reset')"
          data-test="view-reset" @click="ctl?.resetView()"
        >
          <span aria-hidden="true">↺</span>
          <span>{{ $t('view.reset') }}</span>
        </button>
      </div>
    </div>

    <span class="stage-corner corner-tl" aria-hidden="true"></span>
    <span class="stage-corner corner-br" aria-hidden="true"></span>
  </div>
</template>

<style scoped>
.stage {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 360px;
  background-color: var(--uc-stage-bg);
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.14) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.14) 1px, transparent 1px);
  background-size: 80px 80px;
  border: 1px solid var(--uc-border);
  border-radius: 4px;
  overflow: hidden;
}
.canvas-area {
  position: absolute;
  inset: 0;
  touch-action: none;
}
.canvas-area :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
  touch-action: none;
}
.stage-top,
.stage-bottom {
  position: absolute;
  left: 18px;
  right: 18px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  pointer-events: none;
}
.stage-top {
  top: 18px;
  z-index: 4;
  justify-content: space-between;
}
.robot-models {
  pointer-events: auto;
}
#robot-select {
  display: block;
  appearance: none;
  -webkit-appearance: none;
  min-width: 136px;
  min-height: 36px;
  padding: 7px 28px 7px 11px;
  border: 1px solid var(--uc-border-strong);
  border-radius: 3px;
  background-color: rgba(255, 255, 255, 0.88);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23334155' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: var(--uc-ink-strong);
  font: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
#robot-select:hover:not(:disabled) {
  border-color: var(--uc-primary);
  background-color: rgba(255, 255, 255, 0.96);
}
#robot-select option {
  background: #fff;
  color: var(--uc-ink-strong);
  font-weight: 600;
}
.stage-bottom {
  z-index: 4;
  bottom: 18px;
  justify-content: flex-end;
  align-items: center;
}
.stage-actions {
  pointer-events: auto;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
}
.stage-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--uc-border-strong);
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  padding: 7px 11px;
  min-height: 34px;
  border-radius: 3px;
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--uc-ink);
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}
.stage-btn:hover {
  border-color: var(--uc-primary);
  color: var(--uc-primary);
}
.stage-btn[aria-pressed='true'] {
  background: var(--uc-active-bg);
  border-color: var(--uc-active-bg);
  color: #fff;
}
.stage-btn[aria-pressed='true']:hover {
  color: #fff;
}
.view-reset > span:first-child {
  font-size: 14px;
  line-height: 1;
}
.axes-icon {
  display: block;
  flex: none;
}
.stage-corner {
  position: absolute;
  width: 14px;
  height: 14px;
  pointer-events: none;
  border-color: var(--uc-border-strong);
}
.corner-tl {
  top: 8px;
  left: 8px;
  border-top: 1px solid;
  border-left: 1px solid;
}
.corner-br {
  bottom: 8px;
  right: 8px;
  border-bottom: 1px solid;
  border-right: 1px solid;
}
.load-overlay {
  position: absolute;
  z-index: 5;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--uc-ink);
  background: rgba(233, 238, 243, 0.85);
  font-size: 13px;
  font-weight: 500;
}
.spinner {
  width: 15px;
  height: 15px;
  border: 2px solid var(--uc-border-strong);
  border-top-color: var(--uc-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
#robot-select.in-real-card,
#robot-select.in-real-card:disabled {
  background: transparent;
  border-color: transparent;
  box-shadow: none;
  backdrop-filter: none;
  padding: 1px 2px;
  height: auto;
  min-width: 0;
  width: auto;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--uc-ink-strong);
  opacity: 1;
  appearance: none;
  cursor: default;
}
</style>
