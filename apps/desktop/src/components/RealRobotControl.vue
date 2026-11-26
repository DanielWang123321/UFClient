<script setup lang="ts">
// Header trigger pill + dialog for connecting, monitoring, enabling and clearing faults on a physical xArm controller.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEngineStore } from '../stores/engine'
import { useRealStore } from '../stores/real'
import { useMotionStore } from '../stores/motion'
import { robotDisplayName } from '../stores/robot'
import { formatFirmwareVersion } from '../lib/units'

const { t } = useI18n()
const engine = useEngineStore()
const real = useRealStore()
const motion = useMotionStore()

const open = ref(false)
const ipInput = ref(real.ip)

const pillClass = computed(() => {
  if (!real.connected) return 'sim'
  if (real.errorCode !== 0) return 'fault'
  if (real.enabled) return 'live'
  return 'monitor'
})

const pillLabel = computed(() => {
  if (!real.connected) return `${t('real.simMode')} · ${t('real.connectEntry')}`
  const name = robotDisplayName(real.robotKey)
  return `${t('real.realMode')} · ${name} · ${real.ip}`
})

function openDialog() {
  ipInput.value = real.ip
  open.value = true
}

async function onConnect() {
  motion.stop()
  await real.connect(ipInput.value)
}

async function onDisconnect() {
  motion.stop()
  await real.disconnect()
}

async function onEnable() {
  await real.setEnable(true)
}

async function onClearError() {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    if (!window.confirm(t('real.clearErrorConfirm'))) return
  }
  await real.clearError()
}
</script>

<template>
  <div class="real-control">
    <button
      type="button"
      class="real-pill"
      :class="pillClass"
      :disabled="engine.status !== 'connected'"
      data-test="real-trigger"
      @click="openDialog"
    >
      <span class="real-dot" />
      <span>{{ pillLabel }}</span>
    </button>

    <el-dialog v-model="open" :title="$t('real.title')" width="460px" append-to-body>
      <div class="real-body" data-test="real-dialog">
        <div class="connect-row">
          <label for="real-ip">{{ $t('real.ip') }}</label>
          <input
            id="real-ip"
            v-model="ipInput"
            type="text"
            class="ip-input num"
            placeholder="192.168.1.60"
            :disabled="real.connected || real.connecting"
            data-test="real-ip"
            @keydown.enter="!real.connected && onConnect()"
          />
          <button
            v-if="!real.connected"
            type="button"
            class="act-btn primary"
            :disabled="real.connecting || engine.status !== 'connected'"
            data-test="real-connect"
            @click="onConnect"
          >
            {{ real.connecting ? $t('real.connecting') : $t('real.connect') }}
          </button>
          <button
            v-else
            type="button"
            class="act-btn danger"
            :disabled="real.busy"
            data-test="real-disconnect"
            @click="onDisconnect"
          >
            {{ $t('real.disconnect') }}
          </button>
        </div>

        <div v-if="real.lastError" class="err-box" role="alert" data-test="real-error-msg">
          {{ real.lastError }}
        </div>

        <template v-if="real.connected">
          <div class="status-kv">
            <span>{{ $t('real.model') }}</span>
            <b>{{ robotDisplayName(real.robotKey) }} ({{ real.dof }} DOF)</b>
            <span>{{ $t('real.firmware') }}</span>
            <b class="num" data-test="real-firmware-val">{{ formatFirmwareVersion(real.version) }}</b>
            <span>{{ $t('real.stateMode') }}</span>
            <b class="num">state={{ real.state }} / mode={{ real.mode }}</b>
            <template v-if="real.errorCode !== 0 || real.warnCode !== 0">
              <span>{{ $t('real.errWarn') }}</span>
              <b class="num" :class="{ bad: real.errorCode !== 0 }" data-test="real-error-code">
                err={{ real.errorCode }} / warn={{ real.warnCode }}
              </b>
            </template>
            <template v-if="real.isSimulationRobot">
              <span>{{ $t('real.simRobotFlag') }}</span>
              <b>ON</b>
            </template>
          </div>

          <div v-if="!real.enabled || real.errorCode !== 0 || real.warnCode !== 0" class="ctrl-actions">
            <button
              v-if="!real.enabled"
              type="button"
              class="act-btn primary"
              :disabled="real.busy || real.errorCode !== 0"
              data-test="real-enable"
              @click="onEnable"
            >
              {{ $t('real.enable') }}
            </button>

            <button
              v-if="real.errorCode !== 0 || real.warnCode !== 0"
              type="button"
              class="act-btn"
              :disabled="real.busy"
              data-test="real-clear-error"
              @click="onClearError"
            >
              {{ $t('real.clearError') }}
            </button>
          </div>
        </template>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.real-control {
  display: inline-flex;
  align-items: center;
}
.real-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 3px;
  border: 1px solid var(--uc-border-strong);
  background: var(--uc-surface-muted);
  color: var(--uc-ink);
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}
.real-pill:hover:not(:disabled) {
  border-color: var(--uc-primary);
  color: var(--uc-primary);
}
.real-pill:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.real-pill.monitor,
.real-pill.live {
  background: #f0fdf4;
  border-color: var(--uc-ok);
  color: #166534;
}
.real-pill.fault {
  background: #fef2f2;
  border-color: var(--uc-danger);
  color: #991b1b;
}
.real-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #64748b;
  flex: none;
}
.real-pill.monitor .real-dot,
.real-pill.live .real-dot {
  background: var(--uc-ok);
}
.real-pill.fault .real-dot { background: var(--uc-danger); }

.real-body {
  display: grid;
  gap: 12px;
}
.connect-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}
.connect-row label {
  font-size: 12px;
  font-weight: 600;
  color: var(--uc-ink-muted);
  white-space: nowrap;
}
.ip-input {
  height: 32px;
  padding: 0 9px;
  border: 1px solid var(--uc-border-strong);
  border-radius: 3px;
  background: #fff;
  color: var(--uc-ink-strong);
  font-size: 12.5px;
}
.ip-input:disabled {
  background: var(--uc-surface-muted);
  color: var(--uc-ink-muted);
}
.act-btn {
  height: 32px;
  padding: 0 12px;
  border: 1px solid var(--uc-border-strong);
  border-radius: 3px;
  background: #fff;
  color: var(--uc-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.act-btn.primary {
  background: var(--uc-primary);
  border-color: var(--uc-primary);
  color: #fff;
}
.act-btn.danger {
  background: var(--uc-danger);
  border-color: var(--uc-danger);
  color: #fff;
}
.act-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.err-box {
  padding: 8px 10px;
  border: 1px solid rgba(220, 38, 38, 0.35);
  border-left: 3px solid var(--uc-danger);
  border-radius: 3px;
  background: #fef2f2;
  color: #991b1b;
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.status-kv {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 6px 10px;
  padding: 10px 12px;
  border: 1px solid var(--uc-border);
  border-radius: 3px;
  background: var(--uc-surface-muted);
  font-size: 12px;
}
.status-kv span {
  color: var(--uc-ink-muted);
}
.status-kv b {
  color: var(--uc-ink-strong);
  font-weight: 700;
}
.status-kv b.bad {
  color: var(--uc-danger);
}
.ctrl-actions {
  display: flex;
  gap: 8px;
}
</style>
