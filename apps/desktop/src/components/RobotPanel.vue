<script setup lang="ts">
// End-effector card in the right sidebar (robot model selection lives in the 3D stage top-left).
import { useI18n } from 'vue-i18n'
import { useRobotStore } from '../stores/robot'
import { useMotionStore } from '../stores/motion'
import { useSettingsStore } from '../stores/settings'
import { formatMountingLabel } from '../lib/mounting'

const { t } = useI18n()
const robot = useRobotStore()
const motion = useMotionStore()
const settings = useSettingsStore()

async function onEe(ee: string) {
  motion.stop()
  motion.clearNotice()
  await robot.select(robot.key, ee)
}
</script>

<template>
  <section class="selector-card">
    <div class="selector-heading">
      <h2>{{ $t('robot.toolTitle') }}</h2>
    </div>
    <div class="selector-panel">
      <div class="tool-row">
        <label>{{ $t('robot.endEffector') }}</label>
        <el-select :model-value="robot.endEffector" size="small" data-test="ee-select" @update:model-value="onEe">
          <el-option
            v-for="e in robot.info?.end_effectors ?? ['none']"
            :key="e"
            :label="$t(`ee.${e}`)"
            :value="e"
          />
        </el-select>
      </div>
      <div class="tool-row">
        <label>{{ $t('robot.mounting') }}</label>
        <span class="ro-val" data-test="robot-mounting">{{ formatMountingLabel(settings.mounting, t) }}</span>
      </div>
      <div class="hint">{{ $t('robot.eeHint') }}</div>
    </div>
  </section>
</template>

<style scoped>
.selector-card {
  min-width: 0;
  border: 1px solid var(--uc-border);
  border-radius: 4px;
  background: var(--uc-panel-bg);
}
.selector-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
}
.selector-heading h2 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--uc-ink);
}
.selector-panel {
  display: grid;
  gap: 8px;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--uc-border);
}
.tool-row {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}
.tool-row label {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--uc-ink-muted);
}
.ro-val {
  font-size: 12px;
  font-weight: 600;
  color: var(--uc-ink);
  justify-self: end;
}
</style>
