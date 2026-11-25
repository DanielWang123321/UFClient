<script setup lang="ts">
// Frosted-glass telemetry card floating in the top-right corner of the 3D stage.
import { computed } from 'vue'
import { useRobotStore } from '../stores/robot'
import { fmt } from '../lib/units'

const robot = useRobotStore()
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
  <div class="stage-telemetry" data-test="info-panel">
    <div class="telemetry-section">
      <div class="telemetry-head">
        <span>{{ $t('info.tcp') }}</span>
        <small>BASE · mm / °</small>
      </div>
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
</template>

<style scoped>
.stage-telemetry {
  width: 246px;
  flex: none;
  padding: 9px 10px;
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: 1px solid var(--uc-border-strong);
  border-radius: 4px;
  display: grid;
  gap: 8px;
  pointer-events: none;
  user-select: none;
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
