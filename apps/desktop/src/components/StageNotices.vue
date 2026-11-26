<script setup lang="ts">
// Non-blocking floating notices & physical controller fault recovery card at top-center of the 3D stage.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMotionNotice, useMotionStore } from '../stores/motion'
import { useRobotStore } from '../stores/robot'
import { useRealStore } from '../stores/real'
import { getControllerErrorInfo } from '../lib/realErrors'

defineProps<{ loadFailed?: boolean }>()
defineEmits<{ retry: [] }>()

const { t, locale } = useI18n()
const motion = useMotionStore()
const robot = useRobotStore()
const real = useRealStore()

const persistHint = ref(false)
const motionText = computed(() => (motion.notice ? formatMotionNotice(motion.notice, t) : ''))
const faultInfo = computed(() =>
  real.connected && real.errorCode !== 0 ? getControllerErrorInfo(real.errorCode, locale.value) : null,
)

watch(
  () => [real.connected, real.errorCode] as const,
  () => {
    persistHint.value = false
  },
  { flush: 'sync' },
)

async function onClearError() {
  persistHint.value = false
  const cleared = await real.clearError()
  if (cleared) {
    motion.clearNotice()
  } else if (real.connected && real.errorCode !== 0) {
    persistHint.value = true
  }
}
</script>

<template>
  <div class="stage-notices">
    <div v-if="motion.notice" class="stage-notice" role="alert" aria-atomic="true" data-test="motion-notice">
      <span class="notice-badge" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <path
            d="M8 2.2L14.2 13a.75.75 0 0 1-.65 1.12H2.45A.75.75 0 0 1 1.8 13L8 2.2z"
            fill="#dc2626" fill-opacity="0.14" stroke="#dc2626" stroke-width="1.4" stroke-linejoin="round"
          />
          <path d="M8 6.1v3.4M8 11.7h.01" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </span>
      <span class="notice-text" data-test="motion-notice-text">{{ motionText }}</span>
      <button
        type="button" class="notice-close" :aria-label="$t('motion.dismissNotice')"
        data-test="dismiss-motion-notice" @click="motion.clearNotice()"
      >
        ×
      </button>
    </div>

    <div
      v-if="faultInfo"
      class="stage-notice fault-card"
      role="alert"
      aria-atomic="true"
      data-test="real-fault-notice"
    >
      <span class="notice-badge fault-badge" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="15" height="15">
          <path
            d="M8 2.1L14.3 13.1a.78.78 0 0 1-.68 1.17H2.38a.78.78 0 0 1-.68-1.17L8 2.1z"
            fill="#dc2626" fill-opacity="0.14" stroke="#dc2626" stroke-width="1.45" stroke-linejoin="round"
          />
          <path d="M8 6.1v3.5M8 11.8h.01" stroke="#dc2626" stroke-width="1.6" stroke-linecap="round" />
        </svg>
      </span>
      <div class="fault-body">
        <div class="fault-head">
          <span class="fault-code num" data-test="real-fault-code">{{ faultInfo.codeLabel }}</span>
          <strong class="fault-title" data-test="real-fault-title">{{ faultInfo.title }}</strong>
          <span v-if="real.warnCode !== 0" class="warn-pill num" data-test="real-fault-warn">
            {{ $t('real.warnCodeTag', { code: real.warnCode }) }}
          </span>
        </div>
        <p v-if="faultInfo.desc" class="fault-desc" data-test="real-fault-desc">{{ faultInfo.desc }}</p>
        <p v-if="persistHint" class="fault-persist" data-test="real-fault-persist">
          {{ $t('real.clearErrorPersisted') }}
        </p>
      </div>
      <button
        type="button"
        class="clear-err-btn"
        :disabled="real.busy"
        data-test="stage-clear-error"
        @click="onClearError"
      >
        <svg
          :class="{ spin: real.busy }"
          viewBox="0 0 16 16"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M13.5 8a5.5 5.5 0 1 1-1.35-3.6" />
          <polyline points="13.5 2.5 13.5 5.5 10.5 5.5" />
        </svg>
        <span>{{ real.busy ? $t('real.clearingError') : $t('real.clearError') }}</span>
      </button>
    </div>

    <div v-if="real.lastError" class="stage-notice" role="alert" aria-atomic="true" data-test="real-error-notice">
      <span class="notice-badge" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <circle cx="8" cy="8" r="5.8" fill="#dc2626" fill-opacity="0.14" stroke="#dc2626" stroke-width="1.4" />
          <path d="M8 5.2v3.3M8 10.8h.01" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </span>
      <span class="notice-text">{{ real.lastError }}</span>
      <button type="button" class="notice-close" :aria-label="$t('motion.dismissNotice')" @click="real.clearNotice()">
        ×
      </button>
    </div>

    <div v-if="robot.lastError" class="stage-notice" role="alert" aria-atomic="true" data-test="robot-error">
      <span class="notice-badge" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <circle cx="8" cy="8" r="5.8" fill="#dc2626" fill-opacity="0.14" stroke="#dc2626" stroke-width="1.4" />
          <path d="M8 5.2v3.3M8 10.8h.01" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </span>
      <span class="notice-text">{{ robot.lastError }}</span>
      <button type="button" class="notice-close" :aria-label="$t('motion.dismissNotice')" @click="robot.lastError = ''">
        ×
      </button>
    </div>

    <div v-if="loadFailed" class="stage-notice load-error" role="status" aria-atomic="true" data-test="load-error">
      <span class="notice-badge" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="13" height="13">
          <circle cx="8" cy="8" r="5.8" fill="#dc2626" fill-opacity="0.14" stroke="#dc2626" stroke-width="1.4" />
          <path d="M8 5.2v3.3M8 10.8h.01" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </span>
      <span class="notice-text">{{ $t('view.loadFailed') }}</span>
      <button type="button" class="retry-btn" @click="$emit('retry')">{{ $t('view.retry') }}</button>
    </div>
  </div>
</template>

<style scoped>
.stage-notices {
  position: absolute;
  z-index: 7;
  top: 18px;
  left: 50%;
  transform: translateX(-50%);
  width: min(460px, calc(100% - 48px));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}
.stage-notice {
  pointer-events: auto;
  width: max-content;
  max-width: 100%;
  padding: 10px 12px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(220, 38, 38, 0.28);
  border-left: 3px solid var(--uc-danger);
  border-radius: 6px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(15, 23, 42, 0.06);
  color: var(--uc-ink);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  animation: notice-in 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.fault-card {
  width: 100%;
  box-sizing: border-box;
}
.notice-badge {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  background: #fef2f2;
  border: 1px solid rgba(220, 38, 38, 0.18);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  margin-top: 1px;
}
.fault-badge {
  width: 28px;
  height: 28px;
  border-radius: 6px;
}
.notice-text {
  min-width: 0;
  font-weight: 600;
  color: var(--uc-ink-strong);
  padding-top: 1px;
}
.notice-close {
  flex: none;
  width: 22px;
  height: 22px;
  margin: -1px -3px -1px 2px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--uc-ink-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.notice-close:hover {
  background: rgba(15, 23, 42, 0.06);
  color: var(--uc-ink-strong);
}
.fault-body {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
}
.fault-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.fault-code {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 3px;
  background: #fee2e2;
  color: #b91c1c;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.fault-title {
  font-size: 12.5px;
  font-weight: 700;
  color: var(--uc-ink-strong);
  line-height: 1.3;
}
.warn-pill {
  display: inline-flex;
  align-items: center;
  padding: 1px 5px;
  border-radius: 3px;
  background: #fffbeb;
  border: 1px solid rgba(217, 119, 6, 0.32);
  color: #b45309;
  font-size: 10.5px;
  font-weight: 700;
}
.fault-desc {
  margin: 0;
  font-size: 11.5px;
  color: var(--uc-ink-muted);
  line-height: 1.45;
}
.fault-persist {
  margin: 2px 0 0;
  font-size: 11px;
  font-weight: 600;
  color: #b91c1c;
}
.clear-err-btn {
  flex: none;
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 11px;
  border: 1px solid var(--uc-danger);
  border-radius: 4px;
  background: var(--uc-danger);
  color: #fff;
  font: inherit;
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.14s ease, border-color 0.14s ease, opacity 0.14s ease;
}
.clear-err-btn:hover:not(:disabled) {
  background: #b91c1c;
  border-color: #b91c1c;
}
.clear-err-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.spin {
  animation: fault-spin 0.9s linear infinite;
}
.load-error {
  align-items: center;
  gap: 10px;
}
.retry-btn {
  border: 0;
  padding: 5px 10px;
  border-radius: 4px;
  background: var(--uc-active-bg);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
@keyframes fault-spin {
  to { transform: rotate(360deg); }
}
@keyframes notice-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
