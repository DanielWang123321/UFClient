<script setup lang="ts">
// Right-side tabbed motion control card (Cartesian / Joint) with per-tab collapse state.
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRobotStore } from '../stores/robot'
import { useMotionStore } from '../stores/motion'
import { usePressHold } from '../lib/usePressHold'
import CartesianPad from './CartesianPad.vue'
import JointControlList from './JointControlList.vue'

type ControlTab = 'cartesian' | 'joint'

const { t } = useI18n()
const robot = useRobotStore()
const motion = useMotionStore()
const { activeId, down, up, cancel, key, abortAll } = usePressHold()

const activeTab = ref<ControlTab>('cartesian')
const collapsedTabs = reactive<Record<ControlTab, boolean>>({ cartesian: false, joint: false })

const isCollapsed = computed(() => collapsedTabs[activeTab.value])
const busy = computed(() => !robot.sessionId)
const collapseLabel = computed(() => {
  if (activeTab.value === 'joint') {
    return t(isCollapsed.value ? 'motion.expandJoint' : 'motion.collapseJoint')
  }
  return t(isCollapsed.value ? 'motion.expandCartesian' : 'motion.collapseCartesian')
})

function setTab(tab: ControlTab) {
  if (activeTab.value === tab) return
  abortAll()
  motion.stop()
  activeTab.value = tab
}

function toggleCollapse() {
  abortAll()
  motion.stop()
  collapsedTabs[activeTab.value] = !collapsedTabs[activeTab.value]
}

function onSpeedInput(e: Event) {
  motion.speed = Number((e.target as HTMLInputElement).value)
}

function presetCbs(kind: 'home' | 'align') {
  return {
    onClick: () => motion.goStep(kind),
    onHoldStart: () => motion.goStart(kind),
  }
}

onBeforeUnmount(() => {
  abortAll()
  motion.stop()
})
</script>

<template>
  <section id="motion-panel" class="motion-panel" :aria-label="$t('motion.panelTitle')" data-test="motion-bar">
    <div class="control-tabs">
      <div class="control-tab-list" role="tablist" :aria-label="$t('motion.panelTitle')">
        <button
          id="cartesian-tab"
          type="button"
          class="control-tab"
          role="tab"
          :aria-selected="activeTab === 'cartesian'"
          aria-controls="pose-panel"
          data-test="tab-cartesian"
          @click="setTab('cartesian')"
        >
          {{ $t('motion.cartesian') }}
        </button>
        <button
          id="joint-tab"
          type="button"
          class="control-tab"
          role="tab"
          :aria-selected="activeTab === 'joint'"
          aria-controls="joint-panel"
          data-test="tab-joint"
          @click="setTab('joint')"
        >
          {{ $t('motion.joint') }}
        </button>
      </div>
      <button
        id="motion-collapse"
        type="button"
        class="motion-collapse"
        :aria-expanded="!isCollapsed"
        :aria-controls="`${activeTab === 'joint' ? 'joint-panel' : 'pose-panel'} motion-speed pose-actions`"
        :aria-label="collapseLabel"
        :data-chevron="isCollapsed ? 'down' : 'up'"
        data-test="motion-collapse"
        @click="toggleCollapse"
      >
        <svg class="chevron-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
          <polyline
            :points="isCollapsed ? '3.5 5.8 8 10.2 12.5 5.8' : '3.5 10.2 8 5.8 12.5 10.2'"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <div v-show="!isCollapsed" class="motion-body">
      <div v-show="!isCollapsed" id="motion-speed" class="jog-speed-box">
        <div class="jog-speed-heading">
          <span>{{ $t('motion.speed') }}</span>
          <output class="num" for="jog-speed" data-test="speed-readout">{{ motion.speed }}%</output>
        </div>
        <input
          id="jog-speed"
          type="range"
          min="1"
          max="100"
          step="1"
          :value="motion.speed"
          :aria-label="$t('motion.speed')"
          data-test="speed"
          @input="onSpeedInput"
        />
      </div>

      <div v-show="!isCollapsed" id="pose-actions" class="pose-actions">
        <button
          v-for="k in (['home', 'align'] as const)"
          :key="k"
          type="button"
          class="pose-action-btn"
          :class="{ 'is-jogging': activeId === k }"
          :disabled="busy"
          :data-test="k"
          @pointerdown="down($event, k, presetCbs(k), busy)"
          @pointerup="up($event, k)"
          @pointercancel="cancel(k)"
          @lostpointercapture="cancel(k)"
          @blur="cancel(k)"
          @contextmenu.prevent
          @keydown="key($event, k, presetCbs(k).onClick, busy)"
        >
          {{ $t(`motion.${k}`) }}
        </button>
      </div>

      <CartesianPad v-show="!isCollapsed && activeTab === 'cartesian'" :disabled="busy" />
      <JointControlList v-show="!isCollapsed && activeTab === 'joint'" :disabled="busy" />
    </div>
  </section>
</template>

<style scoped>
.motion-panel {
  min-width: 0;
  border: 1px solid var(--uc-border);
  border-radius: 4px;
  background: var(--uc-panel-bg);
}
.control-tabs {
  display: flex;
  gap: 6px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--uc-border);
}
.control-tab-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  flex: 1;
  min-width: 0;
  gap: 6px;
}
.control-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px 8px;
  border: 1px solid var(--uc-border);
  background: var(--uc-surface-muted);
  color: var(--uc-ink-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  border-radius: 2px;
  cursor: pointer;
  transition: background-color 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}
.control-tab:hover:not([aria-selected='true']) {
  border-color: var(--uc-border-strong);
  color: var(--uc-ink);
}
.control-tab[aria-selected='true'] {
  background: var(--uc-active-bg);
  border-color: var(--uc-active-bg);
  color: #fff;
}
.motion-collapse {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  padding: 0;
  flex: none;
  border: 1px solid var(--uc-border);
  border-radius: 2px;
  background: var(--uc-surface-muted);
  color: var(--uc-ink);
  cursor: pointer;
}
.motion-collapse:hover {
  border-color: var(--uc-border-strong);
}
.chevron-icon {
  display: block;
}
.jog-speed-box {
  margin: 12px 18px 0;
  padding: 10px 12px;
  background: var(--uc-surface-muted);
  border: 1px solid var(--uc-border);
  border-radius: 3px;
}
.jog-speed-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--uc-ink-muted);
  font-size: 10.5px;
  font-weight: 700;
}
.jog-speed-heading output {
  font-size: 11px;
  font-weight: 700;
  color: var(--uc-primary);
}
#jog-speed {
  display: block;
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 3px;
  background: #d5dde7;
  margin: 11px 0 6px;
  outline: none;
  cursor: pointer;
}
#jog-speed::-webkit-slider-thumb {
  appearance: none;
  -webkit-appearance: none;
  width: 13px;
  height: 13px;
  border: 3px solid #fff;
  border-radius: 50%;
  background: var(--uc-primary);
  box-shadow: 0 0 0 1px var(--uc-primary);
}
#jog-speed::-moz-range-thumb {
  width: 9px;
  height: 9px;
  border: 3px solid #fff;
  border-radius: 50%;
  background: var(--uc-primary);
  box-shadow: 0 0 0 1px var(--uc-primary);
}
.pose-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 10px 18px 0;
}
.pose-action-btn {
  min-height: 36px;
  padding: 6px 8px;
  border: 1px solid var(--uc-border-strong);
  background: var(--uc-panel-bg);
  color: var(--uc-ink);
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  border-radius: 2px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  transition: background-color 0.1s ease, border-color 0.1s ease, color 0.1s ease;
}
.pose-action-btn:hover:not(:disabled) {
  border-color: var(--uc-primary);
  color: var(--uc-primary);
  background: var(--uc-primary-soft);
}
.pose-action-btn.is-jogging,
.pose-action-btn:active:not(:disabled) {
  background: var(--uc-primary);
  border-color: var(--uc-primary);
  color: #fff;
}
.pose-action-btn:disabled {
  background: #e9eef3;
  border-color: var(--uc-border);
  color: #94a3b8;
  cursor: not-allowed;
}
</style>
