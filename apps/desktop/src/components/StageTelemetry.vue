<script setup lang="ts">
// Frosted-glass telemetry card floating in the top-right corner of the 3D stage, with collapse toggle.
import { computed, ref } from 'vue'
import { useRobotStore } from '../stores/robot'
import { fmt } from '../lib/units'

const robot = useRobotStore()
const collapsed = ref(false)
const tcpFields = [
  { key: 'X', unit: 'mm' },
  { key: 'Y', unit: 'mm' },
  { key: 'Z', unit: 'mm' },
  { key: 'Roll', unit: '°' },
  { key: 'Pitch', unit: '°' },
  { key: 'Yaw', unit: '°' },
] as const
const dof = computed(() => robot.q.length || robot.info?.dof || 6)
</script>

<template>
  <div class="stage-telemetry" :class="{ 'is-collapsed': collapsed }" data-test="info-panel">
    <div class="telemetry-bar">
      <div class="telemetry-bar-head">
        <span class="telemetry-bar-title">{{ collapsed ? $t('info.telemetryTitle') : $t('info.tcp') }}</span>
        <small v-if="!collapsed" class="telemetry-bar-unit">BASE · mm / °</small>
      </div>
      <button
        type="button"
        class="telemetry-toggle"
        :aria-expanded="!collapsed"
        aria-controls="stage-telemetry-body"
        :aria-label="collapsed ? $t('info.expand') : $t('info.collapse')"
        :title="collapsed ? $t('info.expand') : $t('info.collapse')"
        :data-chevron="collapsed ? 'down' : 'up'"
        data-test="telemetry-collapse"
        @click="collapsed = !collapsed"
      >
        <svg class="chevron-icon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
          <polyline
            :points="collapsed ? '3.5 5.8 8 10.2 12.5 5.8' : '3.5 10.2 8 5.8 12.5 10.2'"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <div v-show="!collapsed" id="stage-telemetry-body" class="telemetry-body" data-test="telemetry-body">
      <div class="telemetry-section">
        <div class="telemetry-grid">
          <div v-for="(f, i) in tcpFields" :key="f.key" class="telemetry-cell">
            <span>{{ f.key }}</span>
            <div>
              <output>{{ robot.fk ? fmt(robot.fk.tcp_pose[i], 2) : '—' }}</output>
              <small>{{ f.unit }}</small>
            </div>
          </div>
        </div>
      </div>

      <div class="telemetry-section">
        <div class="telemetry-head">
          <span>{{ $t('info.joints') }}</span>
          <small>J1–J{{ dof }} · °</small>
        </div>
        <div class="telemetry-grid">
          <div v-for="i in dof" :key="i" class="telemetry-cell">
            <span>J{{ i }}</span>
            <div>
              <output :data-test="`q${i}`">{{ fmt(robot.q[i - 1], 2) }}</output>
              <small>°</small>
            </div>
          </div>
        </div>
      </div>

      <div class="telemetry-section telemetry-meta">
        <div>
          <span>{{ $t('info.payload') }}</span>
          <b class="num">{{ fmt(robot.payload.mass_kg, 2) }} kg</b>
        </div>
        <div>
          <span>{{ $t('robot.mounting') }}</span>
          <b>{{ $t('robot.floor') }}</b>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage-telemetry {
  width: 246px;
  flex: none;
  padding: 8px 10px 9px;
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: 1px solid var(--uc-border-strong);
  border-radius: 4px;
  display: grid;
  gap: 6px;
  pointer-events: none;
  user-select: none;
}
.stage-telemetry.is-collapsed {
  width: auto;
  padding: 5px 6px 5px 10px;
  gap: 0;
}
.telemetry-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.telemetry-bar-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  flex: 1;
  min-width: 0;
}
.telemetry-bar-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--uc-ink);
  white-space: nowrap;
}
.telemetry-bar-unit {
  font-size: 8.5px;
  font-weight: 600;
  color: var(--uc-ink-muted);
  white-space: nowrap;
}
.telemetry-toggle {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  flex: none;
  border: 1px solid var(--uc-border);
  border-radius: 3px;
  background: rgba(247, 249, 251, 0.9);
  color: var(--uc-ink);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
}
.telemetry-toggle:hover {
  border-color: var(--uc-primary);
  color: var(--uc-primary);
  background: #fff;
}
.chevron-icon {
  display: block;
}
.telemetry-body {
  display: grid;
  gap: 8px;
}
.telemetry-section + .telemetry-section {
  border-top: 1px solid var(--uc-border);
  padding-top: 7px;
}
.telemetry-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 5px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.03em;
  color: var(--uc-ink);
}
.telemetry-head small {
  font-size: 8.5px;
  font-weight: 600;
  color: var(--uc-ink-muted);
}
.telemetry-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}
.telemetry-cell {
  min-width: 0;
  padding: 4px 5px;
  background: rgba(247, 249, 251, 0.85);
  border: 1px solid var(--uc-border);
  border-radius: 2px;
}
.telemetry-cell > span {
  display: block;
  font-size: 8.5px;
  font-weight: 700;
  color: var(--uc-ink-muted);
  margin-bottom: 2px;
  line-height: 1;
}
.telemetry-cell > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 2px;
  font-size: 11px;
  font-weight: 700;
  color: var(--uc-ink-strong);
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.telemetry-cell output {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.telemetry-cell small {
  font-size: 8px;
  font-weight: 600;
  color: var(--uc-ink-muted);
  flex: none;
}
.telemetry-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  font-size: 11px;
}
.telemetry-meta > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px;
}
.telemetry-meta span {
  font-size: 10px;
  color: var(--uc-ink-muted);
}
.telemetry-meta b {
  font-weight: 700;
  color: var(--uc-ink-strong);
}
</style>
