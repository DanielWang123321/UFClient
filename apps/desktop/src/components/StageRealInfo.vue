<script setup lang="ts">
// Read-only top-left 3D overlay card shown while connected to a physical robot:
// model slot + live controller status + TCP Payload & TCP Offset read from the arm.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRealStore } from '../stores/real'
import { useRobotStore } from '../stores/robot'
import { useSettingsStore } from '../stores/settings'
import { fmt, formatFirmwareVersion } from '../lib/units'

const { t, te } = useI18n()
const real = useRealStore()
const robot = useRobotStore()
const settings = useSettingsStore()

const collapsed = ref(false)

const statusTone = computed(() => {
  if (real.errorCode !== 0) return 'fault'
  if (real.enabled) return 'live'
  return 'monitor'
})

const firmwareVersion = computed(() => formatFirmwareVersion(real.version))

const stateLabel = computed(() =>
  te(`real.states.${real.state}`) ? `${t(`real.states.${real.state}`)} (${real.state})` : String(real.state),
)

const modeLabel = computed(() =>
  te(`real.modes.${real.mode}`) ? `${t(`real.modes.${real.mode}`)} (${real.mode})` : String(real.mode),
)

const comCells = computed(() => [
  { key: 'cx', test: 'real-info-cx', label: 'CX', val: fmt(robot.payload.com_mm[0], 1), unit: 'mm' },
  { key: 'cy', test: 'real-info-cy', label: 'CY', val: fmt(robot.payload.com_mm[1], 1), unit: 'mm' },
  { key: 'cz', test: 'real-info-cz', label: 'CZ', val: fmt(robot.payload.com_mm[2], 1), unit: 'mm' },
])

const tcpCells = computed(() => [
  { key: 'x', test: 'real-info-tcp-x', label: 'X', val: fmt(robot.tcpOffset[0], 2), unit: 'mm' },
  { key: 'y', test: 'real-info-tcp-y', label: 'Y', val: fmt(robot.tcpOffset[1], 2), unit: 'mm' },
  { key: 'z', test: 'real-info-tcp-z', label: 'Z', val: fmt(robot.tcpOffset[2], 2), unit: 'mm' },
  { key: 'roll', test: 'real-info-tcp-roll', label: 'Roll', val: fmt(robot.tcpOffset[3], 2), unit: '°' },
  { key: 'pitch', test: 'real-info-tcp-pitch', label: 'Pitch', val: fmt(robot.tcpOffset[4], 2), unit: '°' },
  { key: 'yaw', test: 'real-info-tcp-yaw', label: 'Yaw', val: fmt(robot.tcpOffset[5], 2), unit: '°' },
])
</script>

<template>
  <aside
    class="stage-real-info"
    :class="{ 'is-collapsed': collapsed }"
    data-test="stage-real-info"
  >
    <div class="real-info-head">
      <div class="real-head-left">
        <span class="real-dot" :class="statusTone" />
        <div class="real-model-slot">
          <slot name="model" />
        </div>
      </div>
      <div class="real-head-actions">
        <button
          type="button"
          class="head-btn"
          :class="{ 'is-busy': real.refreshingSettings }"
          :disabled="real.refreshingSettings"
          :title="$t('settings.refreshFromRobot')"
          :aria-label="$t('settings.refreshFromRobot')"
          data-test="stage-real-refresh"
          @click="real.refreshSettings()"
        >
          <svg
            viewBox="0 0 16 16"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M13.5 8a5.5 5.5 0 1 1-1.35-3.6" />
            <polyline points="13.5 2.5 13.5 5.5 10.5 5.5" />
          </svg>
        </button>
        <button
          type="button"
          class="head-btn"
          :aria-expanded="!collapsed"
          aria-controls="stage-real-info-body"
          :aria-label="collapsed ? $t('real.expandInfo') : $t('real.collapseInfo')"
          :title="collapsed ? $t('real.expandInfo') : $t('real.collapseInfo')"
          :data-chevron="collapsed ? 'down' : 'up'"
          data-test="stage-real-collapse"
          @click="collapsed = !collapsed"
        >
          <svg
            class="chevron-icon"
            viewBox="0 0 16 16"
            width="13"
            height="13"
            aria-hidden="true"
          >
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
    </div>

    <div v-show="!collapsed" id="stage-real-info-body" class="real-info-body" data-test="stage-real-body">
      <section class="info-section">
        <div class="sec-head">
          <span>{{ $t('real.statusTitle') }}</span>
        </div>
        <div class="status-grid">
          <div class="info-cell">
            <span>{{ $t('info.state') }}</span>
            <div>
              <output data-test="real-info-state">{{ stateLabel }}</output>
            </div>
          </div>
          <div class="info-cell">
            <span>{{ $t('info.mode') }}</span>
            <div>
              <output data-test="real-info-mode">{{ modeLabel }}</output>
            </div>
          </div>
          <div class="info-cell">
            <span>{{ $t('real.firmware') }}</span>
            <div>
              <output data-test="real-info-firmware">{{ firmwareVersion }}</output>
            </div>
          </div>
          <div class="info-cell">
            <span>{{ $t('settings.motion.sensitivity') }}</span>
            <div>
              <output data-test="real-info-sensitivity">{{ settings.collisionSensitivity }}</output>
            </div>
          </div>
        </div>
        <div v-if="real.errorCode !== 0 || real.warnCode !== 0" class="err-banner" :class="{ bad: real.errorCode !== 0 }">
          <span>{{ $t('real.errWarn') }}</span>
          <output data-test="real-info-err">{{ real.errorCode }} / {{ real.warnCode }}</output>
        </div>
      </section>

      <section class="info-section">
        <div class="sec-head">
          <span>{{ $t('payload.title') }}</span>
          <small>kg · mm</small>
        </div>
        <div class="info-cell inline-row">
          <span>{{ $t('settings.motion.weight') }}</span>
          <div>
            <output data-test="real-info-mass">{{ fmt(robot.payload.mass_kg, 3) }}</output>
            <small>kg</small>
          </div>
        </div>
        <div class="cells-grid cols-3 com-row">
          <div v-for="c in comCells" :key="c.key" class="info-cell">
            <span>{{ c.label }}</span>
            <div>
              <output :data-test="c.test">{{ c.val }}</output>
              <small>{{ c.unit }}</small>
            </div>
          </div>
        </div>
      </section>

      <section class="info-section">
        <div class="sec-head">
          <span>{{ $t('tcp.title') }}</span>
          <small>mm · °</small>
        </div>
        <div class="cells-grid cols-3">
          <div v-for="c in tcpCells" :key="c.key" class="info-cell">
            <span>{{ c.label }}</span>
            <div>
              <output :data-test="c.test">{{ c.val }}</output>
              <small>{{ c.unit }}</small>
            </div>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<style scoped>
.stage-real-info {
  width: 254px;
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

.stage-real-info.is-collapsed {
  width: auto;
  padding: 5px 6px 5px 10px;
  gap: 0;
}

.real-info-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.real-head-left {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  flex: 1;
}

.real-model-slot {
  min-width: 0;
  pointer-events: auto;
}

.real-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #d97706;
  flex: none;
}

.real-dot.live {
  background: #ea580c;
}

.real-dot.fault {
  background: var(--uc-danger);
}

.real-head-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  pointer-events: auto;
}

.head-btn {
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

.head-btn:hover:not(:disabled) {
  border-color: var(--uc-primary);
  color: var(--uc-primary);
  background: #fff;
}

.head-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

.head-btn.is-busy svg {
  animation: real-info-spin 0.9s linear infinite;
}

@keyframes real-info-spin {
  to {
    transform: rotate(360deg);
  }
}

.chevron-icon {
  display: block;
}

.real-info-body {
  display: grid;
  gap: 8px;
  border-top: 1px solid var(--uc-border);
  padding-top: 7px;
}

.info-section + .info-section {
  border-top: 1px solid var(--uc-border);
  padding-top: 7px;
}

.sec-head {
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

.sec-head small {
  font-size: 8.5px;
  font-weight: 600;
  color: var(--uc-ink-muted);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
}

.cells-grid.cols-3 {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
}

.com-row {
  margin-top: 4px;
}

.info-cell {
  min-width: 0;
  overflow: hidden;
  padding: 4px 6px;
  background: rgba(247, 249, 251, 0.85);
  border: 1px solid var(--uc-border);
  border-radius: 2px;
}

.info-cell > span {
  display: block;
  font-size: 8.5px;
  font-weight: 700;
  color: var(--uc-ink-muted);
  margin-bottom: 2px;
  line-height: 1.1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-cell > div {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 2px;
  min-width: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--uc-ink-strong);
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}

.info-cell output {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.info-cell small {
  font-size: 8px;
  font-weight: 600;
  color: var(--uc-ink-muted);
  flex: none;
}

.info-cell.inline-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
}

.info-cell.inline-row > span {
  margin-bottom: 0;
  font-size: 9.5px;
}

.info-cell.inline-row > div {
  flex: none;
  gap: 3px;
}

.err-banner {
  margin-top: 4px;
  padding: 4px 6px;
  border-radius: 2px;
  border: 1px solid rgba(217, 119, 6, 0.35);
  background: rgba(255, 251, 235, 0.9);
  color: #92400e;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
}

.err-banner.bad {
  border-color: rgba(220, 38, 38, 0.35);
  background: rgba(254, 242, 242, 0.9);
  color: #991b1b;
}

.err-banner output {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
