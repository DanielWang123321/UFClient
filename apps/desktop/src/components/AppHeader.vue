<script setup lang="ts">
// Slim 48px workspace header: branding, real-robot status center, STOP, language.
import { useI18n } from 'vue-i18n'
import { useMotionStore } from '../stores/motion'
import AppLogo from './AppLogo.vue'
import RealRobotControl from './RealRobotControl.vue'

const { locale } = useI18n()
const motion = useMotionStore()
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <AppLogo />
      <nav class="header-nav" aria-label="Workspace">
        <slot name="nav" />
      </nav>
    </div>

    <div class="header-center" data-test="header-center">
      <RealRobotControl />
    </div>

    <div class="header-right">
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
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
.header-left {
  justify-self: start;
}
.header-center {
  display: flex;
  align-items: center;
  justify-content: center;
  justify-self: center;
  min-width: 0;
}
.header-right {
  justify-self: end;
}
.header-nav {
  display: flex;
  align-items: center;
  gap: 4px;
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
  .app-header {
    display: flex;
    justify-content: space-between;
  }
}
</style>
