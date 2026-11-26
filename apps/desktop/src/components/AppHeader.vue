<script setup lang="ts">
// Slim 48px workspace header: branding, real-robot & engine status, STOP, language.
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEngineStore } from '../stores/engine'
import { useMotionStore } from '../stores/motion'
import { useRealStore } from '../stores/real'
import { STATE } from '../lib/motion'
import RealRobotControl from './RealRobotControl.vue'

const { locale } = useI18n()
const engine = useEngineStore()
const motion = useMotionStore()
const real = useRealStore()
const retry = inject<() => void>('engine.retry', () => {})

const effectiveState = computed(() => (real.connected ? real.state : motion.state))
const stateKey = computed(() =>
  effectiveState.value === STATE.moving ? 'moving' : effectiveState.value === STATE.ready ? 'ready' : 'stopped',
)
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <span class="brand-title">{{ $t('app.title') }}</span>
      <nav class="header-nav" aria-label="Workspace">
        <slot name="nav" />
      </nav>
    </div>

    <div class="header-right">
      <RealRobotControl />

      <div class="sim-pill" :class="stateKey">
        <span class="sim-dot" />
        <span data-test="sim-state">{{ $t(`info.${stateKey}`) }} ({{ effectiveState }})</span>
      </div>

      <div
        class="engine-pill"
        :title="engine.error || (engine.hello ? `core ${engine.hello.core_version} / ufactory_genesis ${engine.hello.ufactory_genesis_commit} / pinocchio ${engine.hello.pinocchio_version}` : '')"
      >
        <span class="eng-dot" :class="engine.status" />
        <span data-test="engine-status">{{ $t(`engine.${engine.status}`) }}</span>
        <button v-if="engine.status === 'error'" type="button" class="retry-lnk" @click="retry">
          {{ $t('engine.retry') }}
        </button>
      </div>

      <button type="button" class="stop-btn" data-test="stop" @click="motion.stop()">STOP</button>

      <div class="lang-seg" data-test="lang-switch">
        <button type="button" :class="{ on: locale === 'zh' }" @click="locale = 'zh'">中</button>
        <button type="button" :class="{ on: locale === 'en' }" @click="locale = 'en'">EN</button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  height: 48px;
  flex: none;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--uc-panel-bg);
  border-bottom: 1px solid var(--uc-border);
}
.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.brand-title {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--uc-ink-strong);
  white-space: nowrap;
}
.header-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}
.sim-pill,
.engine-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  padding: 4px 9px;
  border-radius: 3px;
  border: 1px solid var(--uc-border);
  background: var(--uc-surface-muted);
  color: var(--uc-ink);
  white-space: nowrap;
}
.sim-dot,
.eng-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #94a3b8;
  flex: none;
}
.sim-pill.ready .sim-dot { background: #16a34a; }
.sim-pill.moving .sim-dot { background: var(--uc-primary); }
.sim-pill.stopped .sim-dot { background: #d97706; }
.eng-dot.connected { background: #16a34a; }
.eng-dot.connecting { background: #d97706; }
.eng-dot.error { background: var(--uc-danger); }
.retry-lnk {
  border: 0;
  background: none;
  padding: 0;
  margin-left: 2px;
  color: var(--uc-primary);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.stop-btn {
  border: 0;
  border-radius: 3px;
  padding: 6px 16px;
  background: var(--uc-danger);
  color: #fff;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.06em;
  cursor: pointer;
  white-space: nowrap;
}
.stop-btn:hover {
  background: #b91c1c;
}
.lang-seg {
  display: inline-flex;
  border: 1px solid var(--uc-border-strong);
  border-radius: 3px;
  background: var(--uc-surface-muted);
  padding: 2px;
  gap: 2px;
}
.lang-seg button {
  border: 0;
  border-radius: 2px;
  padding: 3px 9px;
  background: transparent;
  color: var(--uc-ink-muted);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.lang-seg button.on {
  background: var(--uc-active-bg);
  color: #fff;
}
@media (max-width: 720px) {
  .engine-pill {
    display: none;
  }
}
</style>
