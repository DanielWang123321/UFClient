<script setup lang="ts">
// End-effector card in the right sidebar (robot model selection lives in the 3D stage top-left).
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRobotStore } from '../stores/robot'
import { useMotionStore } from '../stores/motion'
import { useSettingsStore } from '../stores/settings'
import { useRealStore } from '../stores/real'
import { formatMountingLabel } from '../lib/mounting'
import { GRIPPER_SPECS, isControllableGripper, type GripperState } from '../lib/gripper'

const { t } = useI18n()
const robot = useRobotStore()
const motion = useMotionStore()
const settings = useSettingsStore()
const real = useRealStore()

const showTuning = ref(false)

const activeGripper = computed(() =>
  isControllableGripper(robot.endEffector) ? robot.endEffector : null,
)
const activeSpec = computed(() => (activeGripper.value ? GRIPPER_SPECS[activeGripper.value] : null))
const activeState = computed<GripperState | null>(() =>
  activeGripper.value ? robot.gripperStates[activeGripper.value] : null,
)
const isGripperEnabled = computed(() =>
  activeGripper.value ? Boolean(real.gripperEnabled[activeGripper.value]) : false,
)
const moveDisabled = computed(() => real.connected && (real.errorCode !== 0 || real.gripperBusy))

const tuningRows = computed(() => {
  if (!activeSpec.value || !activeState.value) return []
  return [
    { key: 'speed' as const, label: t('gripper.speed'), spec: activeSpec.value.speed, value: activeState.value.speed },
    { key: 'force' as const, label: t('gripper.force'), spec: activeSpec.value.force, value: activeState.value.force },
  ]
})

async function onEe(ee: string) {
  motion.stop()
  motion.clearNotice()
  await robot.select(robot.key, ee)
}

async function commitMove(posVal?: number) {
  const ee = activeGripper.value
  if (!ee) return
  if (posVal !== undefined) robot.setGripperParams(ee, { pos: posVal })
  if (real.connected) await real.moveGripper(ee)
}

function onPosInput(e: Event) {
  const ee = activeGripper.value
  if (!ee) return
  robot.setGripperParams(ee, { pos: Number((e.target as HTMLInputElement).value) })
}

async function onPosCommit(e: Event) {
  const ee = activeGripper.value
  if (!ee) return
  const input = e.target as HTMLInputElement
  robot.setGripperParams(ee, { pos: Number(input.value) })
  input.value = String(robot.gripperStates[ee].pos)
  if (real.connected) await real.moveGripper(ee)
}

function onTuningChange(key: 'speed' | 'force', e: Event) {
  const ee = activeGripper.value
  if (!ee) return
  const input = e.target as HTMLInputElement
  robot.setGripperParams(ee, { [key]: Number(input.value) })
  input.value = String(robot.gripperStates[ee][key])
}

async function onEnableGripper() {
  if (!activeGripper.value) return
  await real.enableGripper(activeGripper.value)
}
</script>

<template>
  <section class="selector-card">
    <div class="selector-heading">
      <h2>{{ $t('robot.toolTitle') }}</h2>
    </div>
    <div class="selector-panel">
      <div class="tool-row">
        <label>{{ $t('robot.endEffector') }}</label>
        <el-select :model-value="robot.endEffector" size="small" data-test="ee-select" @update:model-value="onEe">
          <el-option
            v-for="e in robot.info?.end_effectors ?? ['none']"
            :key="e"
            :label="$t(`ee.${e}`)"
            :value="e"
          />
        </el-select>
      </div>
      <div class="tool-row">
        <label>{{ $t('robot.mounting') }}</label>
        <span class="ro-val" data-test="robot-mounting">{{ formatMountingLabel(settings.mounting, t) }}</span>
      </div>

      <div v-if="activeGripper && activeSpec && activeState" class="gripper-ctrl" data-test="gripper-ctrl">
        <div class="gripper-actions">
          <div class="gripper-btn-group">
            <button
              type="button"
              class="g-btn"
              :disabled="moveDisabled"
              data-test="gripper-open"
              @click="commitMove(activeSpec.pos.open)"
            >
              {{ $t('gripper.open') }}
            </button>
            <button
              type="button"
              class="g-btn"
              :disabled="moveDisabled"
              data-test="gripper-close"
              @click="commitMove(activeSpec.pos.close)"
            >
              {{ $t('gripper.close') }}
            </button>
            <button
              v-if="real.connected"
              type="button"
              class="g-btn"
              :class="{ active: isGripperEnabled }"
              :disabled="real.gripperBusy || real.errorCode !== 0"
              data-test="gripper-enable"
              @click="onEnableGripper"
            >
              {{ isGripperEnabled ? $t('gripper.enabled') : $t('gripper.enable') }}
            </button>
          </div>
          <button
            type="button"
            class="tuning-toggle"
            :aria-expanded="showTuning"
            aria-controls="gripper-tuning-panel"
            :aria-label="showTuning ? $t('gripper.collapseTuning') : $t('gripper.expandTuning')"
            data-test="gripper-tuning-toggle"
            @click="showTuning = !showTuning"
          >
            <span>{{ $t('gripper.speedAndForce') }}</span>
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <polyline
                :points="showTuning ? '3.5 10.2 8 5.8 12.5 10.2' : '3.5 5.8 8 10.2 12.5 5.8'"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        </div>

        <div class="axis-ctrl">
          <div class="axis-head">
            <span class="axis-label">{{ $t('gripper.position') }}</span>
            <div class="axis-num-wrap">
              <input
                type="number"
                class="axis-num num"
                :min="activeSpec.pos.min"
                :max="activeSpec.pos.max"
                :step="activeSpec.pos.step"
                :value="activeState.pos"
                :disabled="moveDisabled"
                data-test="gripper-pos-input"
                @change="onPosCommit"
              />
              <span v-if="activeSpec.pos.unit" class="axis-unit">{{ activeSpec.pos.unit }}</span>
            </div>
          </div>
          <input
            type="range"
            class="axis-slider"
            :min="activeSpec.pos.min"
            :max="activeSpec.pos.max"
            :step="activeSpec.pos.step"
            :value="activeState.pos"
            :disabled="moveDisabled"
            data-test="gripper-pos-slider"
            @input="onPosInput"
            @change="onPosCommit"
          />
        </div>

        <div v-show="showTuning" id="gripper-tuning-panel" class="tuning-box" data-test="gripper-tuning-panel">
          <div v-for="row in tuningRows" :key="row.key" class="axis-ctrl">
            <div class="axis-head">
              <span class="axis-label">{{ row.label }}</span>
              <div class="axis-num-wrap">
                <input
                  type="number"
                  class="axis-num num"
                  :min="row.spec.min"
                  :max="row.spec.max"
                  :step="row.spec.step"
                  :value="row.value"
                  :data-test="`gripper-${row.key}-input`"
                  @change="onTuningChange(row.key, $event)"
                />
                <span v-if="row.spec.unit" class="axis-unit">{{ row.spec.unit }}</span>
              </div>
            </div>
            <input
              type="range"
              class="axis-slider"
              :min="row.spec.min"
              :max="row.spec.max"
              :step="row.spec.step"
              :value="row.value"
              :data-test="`gripper-${row.key}-slider`"
              @input="onTuningChange(row.key, $event)"
              @change="onTuningChange(row.key, $event)"
            />
          </div>
        </div>

        <div v-if="real.connected && real.gripperError" class="gripper-err" role="alert" data-test="gripper-error">
          {{ real.gripperError }}
        </div>
      </div>

      <div class="hint">{{ $t('robot.eeHint') }}</div>
    </div>
  </section>
</template>

<style scoped>
.selector-card {
  min-width: 0;
  border: 1px solid var(--uc-border);
  border-radius: 4px;
  background: var(--uc-panel-bg);
}
.selector-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
}
.selector-heading h2 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--uc-ink);
}
.selector-panel {
  display: grid;
  gap: 8px;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--uc-border);
}
.tool-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}
.tool-row label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--uc-ink-muted);
}
.ro-val {
  font-size: 12px;
  font-weight: 600;
  color: var(--uc-ink);
  justify-self: end;
}
.gripper-ctrl {
  display: grid;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--uc-border);
}
.gripper-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
}
.gripper-btn-group {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.g-btn {
  padding: 4px 10px;
  border: 1px solid var(--uc-border-strong);
  border-radius: 3px;
  background: var(--uc-surface-muted);
  color: var(--uc-ink);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}
.g-btn:hover:not(:disabled) {
  border-color: var(--uc-primary);
  color: var(--uc-primary);
  background: var(--uc-primary-soft);
}
.g-btn.active {
  border-color: var(--uc-ok);
  color: var(--uc-ok);
  background: #f0fdf4;
}
.g-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.tuning-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 7px;
  border: 1px solid var(--uc-border);
  border-radius: 3px;
  background: transparent;
  color: var(--uc-ink-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.tuning-toggle:hover {
  border-color: var(--uc-border-strong);
  color: var(--uc-ink);
}
.axis-ctrl {
  display: grid;
  gap: 4px;
}
.axis-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.axis-label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--uc-ink-muted);
}
.axis-num-wrap {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
}
.axis-num {
  width: 68px;
  height: 24px;
  padding: 0 6px;
  border: 1px solid var(--uc-border-strong);
  border-radius: 3px;
  background: #fff;
  color: var(--uc-ink-strong);
  font: inherit;
  font-size: 11.5px;
  font-weight: 600;
  text-align: right;
}
.axis-num:disabled {
  background: var(--uc-surface-muted);
  color: var(--uc-ink-muted);
}
.axis-unit {
  font-size: 10.5px;
  color: var(--uc-ink-muted);
  min-width: 24px;
}
.axis-slider {
  width: 100%;
  accent-color: var(--uc-primary);
  cursor: pointer;
}
.axis-slider:disabled {
  cursor: not-allowed;
}
.tuning-box {
  display: grid;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--uc-border);
  border-radius: 3px;
  background: var(--uc-surface-muted);
}
.gripper-err {
  font-size: 11px;
  color: var(--uc-danger);
  line-height: 1.35;
}
</style>
