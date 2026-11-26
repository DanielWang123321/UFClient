<script setup lang="ts">
// Two-column desktop workbench inspired by ufactory_robot_viewer:
// full-height 3D stage on the left, 400px motion & end-effector sidebar on the right.
import { onBeforeUnmount, onMounted } from 'vue'
import Viewport from '../components/Viewport.vue'
import MotionPanel from '../components/MotionPanel.vue'
import RobotPanel from '../components/RobotPanel.vue'
import { useMotionStore } from '../stores/motion'

const motion = useMotionStore()

function stopAll() {
  motion.stop()
}

function onVisibilityChange() {
  if (document.hidden) motion.stop()
}

onMounted(() => {
  window.addEventListener('blur', stopAll)
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  window.removeEventListener('blur', stopAll)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  motion.stop()
})
</script>

<template>
  <div class="workspace">
    <main class="experience">
      <section class="stage-pane">
        <Viewport />
      </section>
      <aside class="control-shell">
        <div class="sidebar-content">
          <MotionPanel />
          <div class="selection-stack">
            <RobotPanel />
          </div>
        </div>
      </aside>
    </main>
  </div>
</template>

<style scoped>
.workspace {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--uc-app-bg);
  color: var(--uc-ink);
}
.experience {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 400px;
  gap: 12px;
  padding: 12px;
  box-sizing: border-box;
}
.stage-pane {
  min-width: 0;
  min-height: 0;
  height: 100%;
}
.control-shell {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
.sidebar-content {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.selection-stack {
  display: grid;
  gap: 10px;
  min-width: 0;
}
@media (max-width: 900px) {
  .workspace {
    height: auto;
    min-height: 100%;
    overflow-y: auto;
  }
  .experience {
    display: flex;
    flex-direction: column;
  }
  .stage-pane {
    height: 480px;
  }
  .control-shell {
    overflow: visible;
    padding-right: 0;
  }
}
</style>
