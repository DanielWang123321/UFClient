<script setup lang="ts">
// Cartesian XYZ/RPY cross D-Pads + vertical Z/Yaw columns.
import { computed } from 'vue'
import { useRobotStore } from '../stores/robot'
import { useMotionStore } from '../stores/motion'
import { disabledTcpAxes, type JogTarget, type TcpAxis } from '../lib/motion'
import { usePressHold } from '../lib/usePressHold'

const props = defineProps<{ disabled?: boolean }>()

const robot = useRobotStore()
const motion = useMotionStore()
const { activeId, down, up, cancel, key } = usePressHold()

const disabledSet = computed(() => new Set(disabledTcpAxes(robot.info?.dof ?? 6)))
const isDisabled = (axis: TcpAxis) => Boolean(props.disabled) || disabledSet.value.has(axis)
const tcp = (axis: TcpAxis): JogTarget => ({ kind: 'tcp', axis })

function btnCbs(axis: TcpAxis, dir: 1 | -1) {
  const t = tcp(axis)
  return {
    onClick: () => motion.step(t, dir),
    onHoldStart: () => motion.startContinuous(t, dir),
  }
}

interface PadBtn {
  id: string
  label: string
  aria: string
  axis: TcpAxis
  dir: 1 | -1
  cls?: string
  test: string
}

const posCross: PadBtn[] = [
  { id: 'x+', label: 'X+', aria: 'X+', axis: 'x', dir: 1, cls: 'dpad-up', test: 'x+' },
  { id: 'y+', label: 'Y+', aria: 'Y+', axis: 'y', dir: 1, cls: 'dpad-left', test: 'y+' },
  { id: 'y-', label: 'Y−', aria: 'Y-', axis: 'y', dir: -1, cls: 'dpad-right', test: 'y-' },
  { id: 'x-', label: 'X−', aria: 'X-', axis: 'x', dir: -1, cls: 'dpad-down', test: 'x-' },
]

const posVert: [PadBtn, PadBtn] = [
  { id: 'z+', label: 'Z+', aria: 'Z+', axis: 'z', dir: 1, test: 'z+' },
  { id: 'z-', label: 'Z−', aria: 'Z-', axis: 'z', dir: -1, test: 'z-' },
]

const rotCross: PadBtn[] = [
  { id: 'p+', label: 'Pitch+', aria: 'Pitch+', axis: 'pitch', dir: 1, cls: 'dpad-up', test: 'pitch+' },
  { id: 'r-', label: 'Roll−', aria: 'Roll-', axis: 'roll', dir: -1, cls: 'dpad-left', test: 'roll-' },
  { id: 'r+', label: 'Roll+', aria: 'Roll+', axis: 'roll', dir: 1, cls: 'dpad-right', test: 'roll+' },
  { id: 'p-', label: 'Pitch−', aria: 'Pitch-', axis: 'pitch', dir: -1, cls: 'dpad-down', test: 'pitch-' },
]

const rotVert: [PadBtn, PadBtn] = [
  { id: 'yaw+', label: 'Yaw+', aria: 'Yaw+', axis: 'yaw', dir: 1, test: 'yaw+' },
  { id: 'yaw-', label: 'Yaw−', aria: 'Yaw-', axis: 'yaw', dir: -1, test: 'yaw-' },
]
</script>

<template>
  <div id="pose-panel" role="tabpanel" aria-labelledby="cartesian-tab" class="pose-panel">
    <div class="jog-group">
      <div class="jog-group-label">
        <span>{{ $t('motion.position') }}</span>
        <span>X / Y / Z · mm</span>
      </div>
      <div class="jog-pad-row">
        <div class="dpad-cross">
          <button
            v-for="b in posCross" :key="b.id" type="button"
            class="jog-btn" :class="[b.cls, { 'is-jogging': activeId === b.id }]"
            :disabled="isDisabled(b.axis)" :aria-label="b.aria" :data-test="b.test"
            @pointerdown="down($event, b.id, btnCbs(b.axis, b.dir), isDisabled(b.axis))"
            @pointerup="up($event, b.id)"
            @pointercancel="cancel(b.id)"
            @lostpointercapture="cancel(b.id)"
            @blur="cancel(b.id)"
            @contextmenu.prevent
            @keydown="key($event, b.id, btnCbs(b.axis, b.dir).onClick, isDisabled(b.axis))"
          >
            {{ b.label }}
          </button>
          <span class="dpad-center" aria-hidden="true">XY</span>
        </div>
        <div class="dpad-vertical">
          <button
            type="button" class="jog-btn" :class="{ 'is-jogging': activeId === posVert[0].id }"
            :disabled="isDisabled(posVert[0].axis)" :aria-label="posVert[0].aria" :data-test="posVert[0].test"
            @pointerdown="down($event, posVert[0].id, btnCbs(posVert[0].axis, posVert[0].dir), isDisabled(posVert[0].axis))"
            @pointerup="up($event, posVert[0].id)"
            @pointercancel="cancel(posVert[0].id)"
            @lostpointercapture="cancel(posVert[0].id)"
            @blur="cancel(posVert[0].id)"
            @contextmenu.prevent
            @keydown="key($event, posVert[0].id, btnCbs(posVert[0].axis, posVert[0].dir).onClick, isDisabled(posVert[0].axis))"
          >
            {{ posVert[0].label }}
          </button>
          <span class="dpad-v-label" aria-hidden="true">Z</span>
          <button
            type="button" class="jog-btn" :class="{ 'is-jogging': activeId === posVert[1].id }"
            :disabled="isDisabled(posVert[1].axis)" :aria-label="posVert[1].aria" :data-test="posVert[1].test"
            @pointerdown="down($event, posVert[1].id, btnCbs(posVert[1].axis, posVert[1].dir), isDisabled(posVert[1].axis))"
            @pointerup="up($event, posVert[1].id)"
            @pointercancel="cancel(posVert[1].id)"
            @lostpointercapture="cancel(posVert[1].id)"
            @blur="cancel(posVert[1].id)"
            @contextmenu.prevent
            @keydown="key($event, posVert[1].id, btnCbs(posVert[1].axis, posVert[1].dir).onClick, isDisabled(posVert[1].axis))"
          >
            {{ posVert[1].label }}
          </button>
        </div>
      </div>
    </div>

    <div class="jog-group">
      <div class="jog-group-label">
        <span>{{ $t('motion.orientation') }}</span>
        <span>Roll / Pitch / Yaw · °</span>
      </div>
      <div class="jog-pad-row">
        <div class="dpad-cross">
          <button
            v-for="b in rotCross" :key="b.id" type="button"
            class="jog-btn" :class="[b.cls, { 'is-jogging': activeId === b.id, 'axis-unsupported': disabledSet.has(b.axis) }]"
            :disabled="isDisabled(b.axis)" :aria-label="b.aria" :data-test="b.test"
            @pointerdown="down($event, b.id, btnCbs(b.axis, b.dir), isDisabled(b.axis))"
            @pointerup="up($event, b.id)"
            @pointercancel="cancel(b.id)"
            @lostpointercapture="cancel(b.id)"
            @blur="cancel(b.id)"
            @contextmenu.prevent
            @keydown="key($event, b.id, btnCbs(b.axis, b.dir).onClick, isDisabled(b.axis))"
          >
            {{ b.label }}
          </button>
          <span class="dpad-center" aria-hidden="true">RP</span>
        </div>
        <div class="dpad-vertical">
          <button
            type="button" class="jog-btn" :class="{ 'is-jogging': activeId === rotVert[0].id }"
            :disabled="isDisabled(rotVert[0].axis)" :aria-label="rotVert[0].aria" :data-test="rotVert[0].test"
            @pointerdown="down($event, rotVert[0].id, btnCbs(rotVert[0].axis, rotVert[0].dir), isDisabled(rotVert[0].axis))"
            @pointerup="up($event, rotVert[0].id)"
            @pointercancel="cancel(rotVert[0].id)"
            @lostpointercapture="cancel(rotVert[0].id)"
            @blur="cancel(rotVert[0].id)"
            @contextmenu.prevent
            @keydown="key($event, rotVert[0].id, btnCbs(rotVert[0].axis, rotVert[0].dir).onClick, isDisabled(rotVert[0].axis))"
          >
            {{ rotVert[0].label }}
          </button>
          <span class="dpad-v-label" aria-hidden="true">Yaw</span>
          <button
            type="button" class="jog-btn" :class="{ 'is-jogging': activeId === rotVert[1].id }"
            :disabled="isDisabled(rotVert[1].axis)" :aria-label="rotVert[1].aria" :data-test="rotVert[1].test"
            @pointerdown="down($event, rotVert[1].id, btnCbs(rotVert[1].axis, rotVert[1].dir), isDisabled(rotVert[1].axis))"
            @pointerup="up($event, rotVert[1].id)"
            @pointercancel="cancel(rotVert[1].id)"
            @lostpointercapture="cancel(rotVert[1].id)"
            @blur="cancel(rotVert[1].id)"
            @contextmenu.prevent
            @keydown="key($event, rotVert[1].id, btnCbs(rotVert[1].axis, rotVert[1].dir).onClick, isDisabled(rotVert[1].axis))"
          >
            {{ rotVert[1].label }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pose-panel {
  padding-bottom: 14px;
}
.jog-group {
  margin: 12px 18px 0;
}
.jog-group-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  font-size: 10.5px;
  font-weight: 700;
  color: var(--uc-ink-muted);
}
.jog-group-label span:last-child {
  font-weight: 600;
  font-size: 9.5px;
  opacity: 0.85;
}
.jog-pad-row {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 1.15fr);
  gap: 10px;
  padding: 9px;
  background: var(--uc-surface-muted);
  border: 1px solid var(--uc-border);
  border-radius: 3px;
}
.dpad-cross {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(3, 35px);
  gap: 4px;
}
.dpad-up { grid-column: 2; grid-row: 1; }
.dpad-left { grid-column: 1; grid-row: 2; }
.dpad-center {
  grid-column: 2;
  grid-row: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--uc-ink-muted);
  border: 1px dashed var(--uc-border-strong);
  border-radius: 2px;
  user-select: none;
}
.dpad-right { grid-column: 3; grid-row: 2; }
.dpad-down { grid-column: 2; grid-row: 3; }
.dpad-vertical {
  display: grid;
  grid-template-rows: 35px 1fr 35px;
  gap: 4px;
  border-left: 1px solid var(--uc-border);
  padding-left: 10px;
}
.dpad-v-label {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9.5px;
  font-weight: 800;
  letter-spacing: 0.06em;
  color: var(--uc-ink-muted);
  user-select: none;
}
.jog-btn {
  border: 1px solid var(--uc-border-strong);
  background: var(--uc-panel-bg);
  color: var(--uc-ink);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  padding: 0 4px;
  border-radius: 2px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  transition: background-color 0.1s ease, border-color 0.1s ease, color 0.1s ease;
}
.jog-btn:hover:not(:disabled) {
  border-color: var(--uc-primary);
  color: var(--uc-primary);
  background: var(--uc-primary-soft);
}
.jog-btn.is-jogging,
.jog-btn:active:not(:disabled) {
  background: var(--uc-primary);
  border-color: var(--uc-primary);
  color: #fff;
}
.jog-btn:disabled {
  background: #e9eef3;
  border-color: var(--uc-border);
  color: #94a3b8;
  cursor: not-allowed;
}
</style>
