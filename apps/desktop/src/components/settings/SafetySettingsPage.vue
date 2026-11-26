<script setup lang="ts">
// Safety Settings sub-page: placeholder banner for Studio safety features + active per-model Safety Boundary card.
import { computed, ref, watch } from 'vue'
import { useSettingsStore } from '../../stores/settings'
import { robotDisplayName, useRobotStore } from '../../stores/robot'
import type { Boundary } from '../../lib/boundary'

const settings = useSettingsStore()
const robot = useRobotStore()

const model = computed<[number, number][]>(() => robot.info?.limits_deg ?? [])
const b = ref<Boundary>(settings.boundaryFor(robot.key, model.value))
watch([() => robot.key, model], () => {
  b.value = settings.boundaryFor(robot.key, model.value)
})

function commit() {
  settings.setBoundary(robot.key, b.value, model.value)
  b.value = settings.boundaryFor(robot.key, model.value)
}

function reset() {
  settings.resetBoundary(robot.key)
  b.value = settings.boundaryFor(robot.key, model.value)
}

const AX = ['X', 'Y', 'Z'] as const
</script>

<template>
  <div class="subpage" data-test="settings-page-safety">
    <div class="planned-banner">
      <div class="planned-head">
        <strong>{{ $t('settings.nav.safety') }}</strong>
        <span class="badge">{{ $t('settings.placeholderBadge') }}</span>
      </div>
      <p>{{ $t('settings.safetyPage.plannedDesc') }}</p>
    </div>

    <article class="card">
      <div class="card-head">
        <h2>{{ $t('settings.safetyPage.boundaryTitle') }}</h2>
        <button type="button" class="uc-btn" @click="reset">{{ $t('settings.resetBoundary') }}</button>
      </div>
      <p class="hint">{{ $t('settings.safetyHint', { model: robotDisplayName(robot.key) }) }}</p>

      <div class="grid">
        <span />
        <b>{{ $t('motion.min') }}</b>
        <b>{{ $t('motion.max') }}</b>
        <template v-for="(a, i) in AX" :key="a">
          <span>TCP {{ a }} (mm)</span>
          <el-input-number
            v-model="b.tcpMin[i]"
            :controls="false"
            :precision="1"
            :value-on-clear="null"
            :placeholder="$t('settings.unbounded')"
            :data-test="`tcp-min-${a}`"
            @change="commit"
          />
          <el-input-number
            v-model="b.tcpMax[i]"
            :controls="false"
            :precision="1"
            :value-on-clear="null"
            :placeholder="$t('settings.unbounded')"
            :data-test="`tcp-max-${a}`"
            @change="commit"
          />
        </template>
        <template v-for="(l, i) in model" :key="i">
          <span>
            J{{ i + 1 }} (°) <i class="lim">[{{ l[0].toFixed(1) }}, {{ l[1].toFixed(1) }}]</i>
          </span>
          <el-input-number v-model="b.jointMin[i]" :controls="false" :precision="1" :min="l[0]" :max="l[1]" @change="commit" />
          <el-input-number v-model="b.jointMax[i]" :controls="false" :precision="1" :min="l[0]" :max="l[1]" @change="commit" />
        </template>
      </div>
    </article>
  </div>
</template>

<style scoped>
.subpage {
  display: grid;
  gap: 14px;
}
.planned-banner {
  background: var(--uc-panel-bg);
  border: 1px solid var(--uc-border);
  border-left: 3px solid var(--uc-primary);
  border-radius: 4px;
  padding: 14px 18px;
  display: grid;
  gap: 6px;
}
.planned-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13.5px;
  color: var(--uc-ink-strong);
}
.planned-banner p {
  margin: 0;
  font-size: 12.5px;
  color: var(--uc-ink-muted);
  line-height: 1.5;
}
.badge {
  padding: 2px 8px;
  border-radius: 3px;
  background: var(--uc-primary-soft);
  color: var(--uc-primary);
  font-size: 11px;
  font-weight: 700;
}
.card {
  background: var(--uc-panel-bg);
  border: 1px solid var(--uc-border);
  border-radius: 4px;
  padding: 18px 22px;
  display: grid;
  gap: 12px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.card-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--uc-ink-strong);
}
.uc-btn {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--uc-border-strong);
  border-radius: 4px;
  background: var(--uc-surface-muted);
  color: var(--uc-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 130px 130px;
  gap: 8px 12px;
  align-items: center;
}
.grid > span {
  color: var(--uc-ink);
  font-size: 12.5px;
}
.grid b {
  font-weight: 700;
  font-size: 12px;
  color: var(--uc-ink-strong);
}
.grid :deep(.el-input-number) {
  width: 130px;
}
.lim {
  font-style: normal;
  color: var(--uc-ink-muted);
  font-size: 11px;
}
</style>
