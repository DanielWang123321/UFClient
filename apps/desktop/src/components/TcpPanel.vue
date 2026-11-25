<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRobotStore } from '../stores/robot'
import { useRealStore } from '../stores/real'
import { fmt } from '../lib/units'

const robot = useRobotStore()
const real = useRealStore()
const open = ref(false)
const labels = ['x', 'y', 'z', 'r', 'p', 'y']
const draft = ref<number[]>([...robot.tcpOffset])

watch(
  () => robot.tcpOffset,
  (v) => (draft.value = [...v]),
)

const { t } = useI18n()
const presets = computed(() => {
  const list = [{ name: t('tcp.flange'), offset: [0, 0, 0, 0, 0, 0] }]
  const info = robot.info
  if (info && info.end_effector !== 'none') {
    list.push({ name: `${t(`ee.${info.end_effector}`)} (${t('tcp.toolDefault')})`, offset: [...info.default_tcp_offset] })
  }
  return list
})

const summary = computed(() => {
  const o = robot.tcpOffset
  if (o.every((v) => Math.abs(v) < 0.005)) return t('tcp.summaryNone')
  return `${fmt(o[0], 1)}, ${fmt(o[1], 1)}, ${fmt(o[2], 1)} mm`
})

async function onApply() {
  if (!real.connected) {
    await robot.applyTcp(draft.value)
    return
  }
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    if (!window.confirm(t('tcp.confirmReal'))) return
  }
  await real.writeTcp(draft.value)
}
</script>

<template>
  <section class="selector-card">
    <button type="button" class="selector-toggle" :aria-expanded="open" @click="open = !open">
      <h2>{{ $t('tcp.title') }}</h2>
      <span class="summary num">{{ summary }}</span>
      <svg class="chev" :class="{ open }" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <polyline points="3.5 5.8 8 10.2 12.5 5.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <div v-show="open" class="selector-panel">
      <el-select size="small" placeholder="Preset" style="width: 100%" @change="(i: number) => (draft = [...presets[i].offset])">
        <el-option v-for="(p, i) in presets" :key="p.name" :label="p.name" :value="i" />
      </el-select>
      <div class="grid6">
        <label v-for="(l, i) in labels" :key="i">
          <span>{{ l }}</span>
          <el-input-number v-model="draft[i]" size="small" :controls="false" :precision="2" />
        </label>
      </div>
      <div class="row">
        <span class="hint">{{ $t('tcp.hint') }}</span>
        <el-button size="small" type="primary" plain @click="onApply">{{ $t('tcp.apply') }}</el-button>
      </div>
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
.selector-toggle {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 11px 16px;
  border: 0;
  background: transparent;
  color: var(--uc-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.selector-toggle:hover {
  background: var(--uc-surface-muted);
}
.selector-toggle h2 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
}
.summary {
  justify-self: end;
  font-size: 11px;
  font-weight: 600;
  color: var(--uc-ink-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chev {
  color: var(--uc-ink-muted);
  transition: transform 0.15s ease;
}
.chev.open {
  transform: rotate(180deg);
}
.selector-panel {
  display: grid;
  gap: 8px;
  padding: 10px 16px 12px;
  border-top: 1px solid var(--uc-border);
}
.grid6 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}
.grid6 label {
  display: flex;
  align-items: center;
  gap: 4px;
}
.grid6 span {
  width: 10px;
  font-size: 11px;
  color: var(--uc-ink-muted);
}
.grid6 :deep(.el-input-number) {
  width: 100%;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
}
</style>
