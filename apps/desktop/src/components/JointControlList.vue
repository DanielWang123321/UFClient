<script setup lang="ts">
// Read-only zero-centered bidirectional joint meters with -/+ jog buttons.
import { computed } from 'vue'
import { useRobotStore } from '../stores/robot'
import { useMotionStore } from '../stores/motion'
import { jointProgress, type JogTarget } from '../lib/motion'
import { usePressHold } from '../lib/usePressHold'
import { fmt } from '../lib/units'

const props = defineProps<{ disabled?: boolean }>()

const robot = useRobotStore()
const motion = useMotionStore()
const { activeId, down, up, cancel, key } = usePressHold()

const joints = computed(() => {
  const names = robot.info?.joint_names ?? []
  const lims = robot.info?.limits_deg ?? []
  return names.map((name, i) => {
    const [lo, hi] = lims[i] ?? [-360, 360]
    const deg = robot.q[i] ?? 0
    return {
      name,
      index: i,
      lo,
      hi,
      deg,
      progress: jointProgress(deg, lo, hi),
    }
  })
})

const fmtLim = (v: number) => `${Math.round(v * 10) / 10}°`
const target = (i: number): JogTarget => ({ kind: 'joint', index: i })
function cbs(i: number, dir: 1 | -1) {
  const t = target(i)
  return {
    onClick: () => motion.step(t, dir),
    onHoldStart: () => motion.startContinuous(t, dir),
  }
}
</script>

<template>
  <div id="joint-panel" role="tabpanel" aria-labelledby="joint-tab" class="joint-list">
    <div v-for="j in joints" :key="j.name" class="joint-row">
      <span class="joint-label">J{{ j.index + 1 }}</span>

      <button
        type="button" class="joint-jog-btn"
        :class="{ 'is-jogging': activeId === `j${j.index}-` }"
        :disabled="props.disabled"
        :aria-label="$t('motion.jointDecrease', { j: j.index + 1 })"
        :data-test="`j${j.index + 1}-`"
        @pointerdown="down($event, `j${j.index}-`, cbs(j.index, -1), props.disabled)"
        @pointerup="up($event, `j${j.index}-`)"
        @pointercancel="cancel(`j${j.index}-`)"
        @lostpointercapture="cancel(`j${j.index}-`)"
        @blur="cancel(`j${j.index}-`)"
        @contextmenu.prevent
        @keydown="key($event, `j${j.index}-`, cbs(j.index, -1).onClick, props.disabled)"
      >
        −
      </button>

      <div class="joint-meter">
        <div class="joint-meter-head">
          <span class="joint-limit">{{ fmtLim(j.lo) }}</span>
          <output class="joint-angle num" :aria-label="$t('motion.jointAngle', { j: j.index + 1 })">
            {{ fmt(j.deg, 2) }}°
          </output>
          <span class="joint-limit">{{ fmtLim(j.hi) }}</span>
        </div>
        <div
          class="joint-progress"
          role="progressbar"
          :aria-label="$t('motion.jointPosition', { j: j.index + 1 })"
          :aria-valuemin="Math.round(j.lo * 10) / 10"
          :aria-valuemax="Math.round(j.hi * 10) / 10"
          :aria-valuenow="fmt(j.deg, 2)"
          :aria-valuetext="`${fmt(j.deg, 2)}°`"
        >
          <span class="joint-progress-zero" :style="{ left: `${j.progress.zeroPct.toFixed(3)}%` }" aria-hidden="true" />
          <span
            class="joint-progress-fill"
            :style="{ left: `${j.progress.fillLeft.toFixed(3)}%`, width: `${j.progress.fillWidth.toFixed(3)}%` }"
            aria-hidden="true"
          />
          <span
            class="joint-progress-marker"
            :style="{ left: `${j.progress.currentPct.toFixed(3)}%` }"
            aria-hidden="true"
          />
        </div>
      </div>

      <button
        type="button" class="joint-jog-btn"
        :class="{ 'is-jogging': activeId === `j${j.index}+` }"
        :disabled="props.disabled"
        :aria-label="$t('motion.jointIncrease', { j: j.index + 1 })"
        :data-test="`j${j.index + 1}+`"
        @pointerdown="down($event, `j${j.index}+`, cbs(j.index, 1), props.disabled)"
        @pointerup="up($event, `j${j.index}+`)"
        @pointercancel="cancel(`j${j.index}+`)"
        @lostpointercapture="cancel(`j${j.index}+`)"
        @blur="cancel(`j${j.index}+`)"
        @contextmenu.prevent
        @keydown="key($event, `j${j.index}+`, cbs(j.index, 1).onClick, props.disabled)"
      >
        +
      </button>
    </div>
  </div>
</template>

<style scoped>
.joint-list {
  padding: 8px 18px 12px;
}
.joint-row {
  display: grid;
  grid-template-columns: 22px 34px minmax(0, 1fr) 34px;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
}
.joint-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--uc-ink);
  white-space: nowrap;
}
.joint-meter {
  min-width: 0;
  display: grid;
  gap: 5px;
}
.joint-meter-head {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: baseline;
  gap: 4px;
  line-height: 1.1;
}
.joint-limit {
  font-size: 9.5px;
  font-weight: 600;
  color: var(--uc-ink-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.joint-limit:last-child {
  text-align: right;
}
.joint-angle {
  text-align: center;
  font-size: 11px;
  font-weight: 700;
  color: var(--uc-ink-strong);
  white-space: nowrap;
}
.joint-progress {
  position: relative;
  height: 5px;
  margin-inline: 2px;
  border-radius: 999px;
  background: #e2e8f0;
  pointer-events: none;
}
.joint-progress-zero {
  position: absolute;
  top: 50%;
  width: 1.5px;
  height: 9px;
  background: #94a3b8;
  border-radius: 1px;
  transform: translate(-50%, -50%);
}
.joint-progress-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--uc-primary);
  border-radius: 999px;
}
.joint-progress-marker {
  position: absolute;
  top: 50%;
  width: 3px;
  height: 11px;
  background: var(--uc-active-bg);
  border-radius: 1.5px;
  box-shadow: 0 0 0 1px #fff;
  transform: translate(-50%, -50%);
}
.joint-jog-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--uc-border-strong);
  background: var(--uc-panel-bg);
  color: var(--uc-ink);
  font: inherit;
  font-size: 17px;
  font-weight: 700;
  line-height: 1;
  border-radius: 2px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  transition: background-color 0.1s ease, border-color 0.1s ease, color 0.1s ease;
}
.joint-jog-btn:hover:not(:disabled) {
  border-color: var(--uc-primary);
  color: var(--uc-primary);
  background: var(--uc-primary-soft);
}
.joint-jog-btn.is-jogging,
.joint-jog-btn:active:not(:disabled) {
  background: var(--uc-primary);
  border-color: var(--uc-primary);
  color: #fff;
}
.joint-jog-btn:disabled {
  background: #e9eef3;
  border-color: var(--uc-border);
  color: #94a3b8;
  cursor: not-allowed;
}
</style>
