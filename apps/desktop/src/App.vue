<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import enLocale from 'element-plus/es/locale/lang/en'
import AppHeader from './components/AppHeader.vue'
import AppNavRail, { type AppPage } from './components/AppNavRail.vue'
import CheckView from './views/CheckView.vue'
import FeaturePlaceholderView from './views/FeaturePlaceholderView.vue'
import SettingsView from './views/SettingsView.vue'
import { useEngineStore } from './stores/engine'
import { useMotionStore } from './stores/motion'
import { useRobotStore } from './stores/robot'
import { DEFAULT_ROBOT, useSettingsStore } from './stores/settings'

const { locale } = useI18n()
const engine = useEngineStore()
const motion = useMotionStore()
const robot = useRobotStore()
const settings = useSettingsStore()
const activePage = ref<AppPage>('live')
const lastPrimaryPage = ref<Exclude<AppPage, 'settings'>>('live')
const elLocale = computed(() => (locale.value === 'zh' ? zhCn : enLocale))
watch(locale, (l) => localStorage.setItem('ufclient.locale', l))

function selectPage(page: AppPage) {
  motion.stop()
  if (page === 'settings') {
    activePage.value = activePage.value === 'settings' ? lastPrimaryPage.value : 'settings'
  } else {
    lastPrimaryPage.value = page
    activePage.value = page
  }
}

function backFromSettings() {
  activePage.value = lastPrimaryPage.value
}

async function start() {
  if (await engine.connect()) {
    await robot.fetchRobots()
    const known = (k: string) => robot.robots.some((r) => r.key === k)
    const last = settings.restoreSession ? settings.session : null
    if (last && known(last.robot) && (await robot.select(last.robot, last.endEffector))) {
      await robot.applyTcp(last.tcpOffset)
      await robot.applyPayload(last.payload)
      if (last.q.length === robot.info?.dof) await robot.setQ(last.q)
    } else {
      const targetKey = known(settings.defaultRobot) ? settings.defaultRobot : DEFAULT_ROBOT
      const targetSpec = robot.robots.find((r) => r.key === targetKey)
      const savedEe = settings.endEffectorFor(targetKey)
      const targetEe = targetSpec?.end_effectors.includes(savedEe) ? savedEe : 'none'
      await robot.load(targetKey, targetEe)
    }
  }
}

// Remember the session (robot, tool, TCP, payload, joints) for "restore last session".
let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => [robot.key, robot.endEffector, robot.tcpOffset, robot.payload, robot.q, settings.restoreSession],
  () => {
    if (!robot.info) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      settings.session = settings.restoreSession
        ? { robot: robot.key, endEffector: robot.endEffector, tcpOffset: [...robot.tcpOffset], payload: { ...robot.payload, com_mm: [...robot.payload.com_mm] }, q: [...robot.q] }
        : null
    }, 500)
  },
  { deep: true },
)
provide('engine.retry', start)
onMounted(start)
</script>

<template>
  <el-config-provider :locale="elLocale" size="small">
    <div class="app-shell">
      <AppHeader />
      <div class="app-workspace">
        <AppNavRail :active="activePage" @select="selectPage" />
        <div class="app-body">
          <!-- Preserve WebGL context & URDF assets when switching pages. -->
          <CheckView v-show="activePage === 'live'" />
          <FeaturePlaceholderView
            v-if="activePage === 'blockly' || activePage === 'python' || activePage === 'gcode'"
            :feature="activePage"
          />
          <SettingsView v-if="activePage === 'settings'" @back="backFromSettings" />
        </div>
      </div>
    </div>
  </el-config-provider>
</template>

<style scoped>
.app-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--uc-app-bg);
  color: var(--uc-ink);
}
.app-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.app-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
