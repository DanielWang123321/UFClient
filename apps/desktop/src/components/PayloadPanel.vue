<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRobotStore } from '../stores/robot'
import { useRealStore } from '../stores/real'
import { fmt } from '../lib/units'

const { t } = useI18n()
const robot = useRobotStore()
const real = useRealStore()
const open = ref(false)
const mass = ref(robot.payload.mass_kg)
const com = ref<number[]>([...robot.payload.com_mm])

watch(
  () => robot.payload,
  (p) => {
    mass.value = p.mass_kg
    com.value = [...p.com_mm]
  },
)

async function onApply() {
  const next = { mass_kg: mass.value, com_mm: [...com.value] }
  if (!real.connected) {
    await robot.applyPayload(next)
    return
  }
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    if (!window.confirm(t('payload.confirmReal'))) return
  }
  await real.writePayload(next)
}
</script>

<template>
  <section class="selector-card">
    <button type="button" class="selector-toggle" :aria-expanded="open" @click="open = !open">
      <h2>{{ $t('payload.title') }}</h2>
      <span class="summary num">{{ fmt(robot.payload.mass_kg, 2) }} kg</span>
      <svg class="chev" :class="{ open }" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <polyline points="3.5 5.8 8 10.2 12.5 5.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>
    <div v-show="open" class="selector-panel">
      <el-form label-position="top" size="small">
        <el-form-item :label="$t('payload.mass')">
          <el-input-number v-model="mass" :min="0" :step="0.1" :precision="3" data-test="payload-mass" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="$t('payload.com')">
          <div class="grid3">
            <el-input-number v-for="i in 3" :key="i" v-model="com[i - 1]" :controls="false" :precision="1" />
          </div>
        </el-form-item>
      </el-form>
      <div class="row">
        <span class="hint">{{ $t('payload.hint') }}</span>
        <el-button size="small" type="primary" plain @click="onApply">
          {{ $t('payload.apply') }}
        </el-button>
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
.selector-panel :deep(.el-form-item) {
  margin-bottom: 8px;
}
.grid3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 100%;
}
.grid3 :deep(.el-input-number) {
  width: 100%;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 6px;
}
</style>
