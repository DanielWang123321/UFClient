<script setup lang="ts">
// Non-blocking floating notices at top-center of the 3D stage.
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatMotionNotice, useMotionStore } from '../stores/motion'
import { useRobotStore } from '../stores/robot'
import { useRealStore } from '../stores/real'

defineProps<{ loadFailed?: boolean }>()
defineEmits<{ retry: [] }>()

const { t } = useI18n()
const motion = useMotionStore()
const robot = useRobotStore()
const real = useRealStore()

const motionText = computed(() => (motion.notice ? formatMotionNotice(motion.notice, t) : ''))
</script>

<template>
  <div class="stage-notices">
    <div v-if="motion.notice" class="stage-notice" role="alert" aria-atomic="true" data-test="motion-notice">
      <svg class="notice-icon" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <path
          d="M8 2.1L14.4 13.3a.8.8 0 0 1-.7 1.2H2.3a.8.8 0 0 1-.7-1.2L8 2.1z"
          fill="#dc2626" fill-opacity="0.14" stroke="#dc2626" stroke-width="1.4" stroke-linejoin="round"
        />
        <path d="M8 6.2v3.6M8 11.9h.01" stroke="#dc2626" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <span class="notice-text" data-test="motion-notice-text">{{ motionText }}</span>
      <button
        type="button" class="notice-close" :aria-label="$t('motion.dismissNotice')"
        data-test="dismiss-motion-notice" @click="motion.clearNotice()"
      >
        ×
      </button>
    </div>

    <div v-if="real.connected && real.errorCode !== 0" class="stage-notice" role="alert" aria-atomic="true" data-test="real-fault-notice">
      <span class="notice-text">{{ $t('real.errorHint', { code: real.errorCode }) }}</span>
    </div>

    <div v-if="real.lastError" class="stage-notice" role="alert" aria-atomic="true" data-test="real-error-notice">
      <span class="notice-text">{{ real.lastError }}</span>
      <button type="button" class="notice-close" :aria-label="$t('motion.dismissNotice')" @click="real.clearNotice()">
        ×
      </button>
    </div>

    <div v-if="robot.lastError" class="stage-notice" role="alert" aria-atomic="true" data-test="robot-error">
      <span class="notice-text">{{ robot.lastError }}</span>
      <button type="button" class="notice-close" :aria-label="$t('motion.dismissNotice')" @click="robot.lastError = ''">
        ×
      </button>
    </div>

    <div v-if="loadFailed" class="stage-notice load-error" role="status" aria-atomic="true" data-test="load-error">
      <span>{{ $t('view.loadFailed') }}</span>
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
  width: min(380px, calc(100% - 48px));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
}
.stage-notice {
  pointer-events: auto;
  width: max-content;
  max-width: 100%;
  padding: 8px 12px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: rgba(255, 249, 249, 0.95);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(220, 38, 38, 0.36);
  border-left: 3px solid var(--uc-danger);
  border-radius: 3px;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.1);
  color: #991b1b;
  font-size: 11.5px;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
  animation: notice-in 0.15s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.notice-icon {
  flex: none;
  margin-top: 1px;
}
.notice-text {
  min-width: 0;
}
.notice-close {
  flex: none;
  width: 20px;
  height: 20px;
  margin: -2px -4px -2px 2px;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: inherit;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.notice-close:hover {
  background: rgba(220, 38, 38, 0.12);
}
.load-error {
  align-items: center;
  gap: 10px;
}
.retry-btn {
  border: 0;
  padding: 5px 10px;
  border-radius: 2px;
  background: var(--uc-active-bg);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
@keyframes notice-in {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
