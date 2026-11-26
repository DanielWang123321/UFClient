<script setup lang="ts">
// General Settings sub-page: placeholder banner for Studio system tools + General preferences & About info.
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../../stores/settings'
import { robotDisplayName, useRobotStore } from '../../stores/robot'
import { useEngineStore } from '../../stores/engine'
import pkg from '../../../package.json'

const { locale } = useI18n()
const settings = useSettingsStore()
const robot = useRobotStore()
const engine = useEngineStore()
</script>

<template>
  <div class="subpage" data-test="settings-page-general">
    <div class="planned-banner">
      <div class="planned-head">
        <strong>{{ $t('settings.nav.general') }}</strong>
        <span class="badge">{{ $t('settings.placeholderBadge') }}</span>
      </div>
      <p>{{ $t('settings.generalPage.plannedDesc') }}</p>
    </div>

    <article class="card">
      <h2>{{ $t('settings.general') }}</h2>
      <div class="row">
        <span>{{ $t('settings.language') }}</span>
        <el-radio-group v-model="locale">
          <el-radio-button value="zh">中文</el-radio-button>
          <el-radio-button value="en">English</el-radio-button>
        </el-radio-group>
      </div>
      <div class="row">
        <span>{{ $t('settings.defaultRobot') }}</span>
        <el-select v-model="settings.defaultRobot" style="width: 180px">
          <el-option v-for="r in robot.robots" :key="r.key" :label="robotDisplayName(r.key, r.robot_name)" :value="r.key" />
        </el-select>
      </div>
      <div class="row">
        <span>{{ $t('settings.restoreSession') }}</span>
        <el-switch v-model="settings.restoreSession" data-test="restore-session" />
      </div>
      <p class="hint">{{ $t('settings.restoreHint') }}</p>
    </article>

    <article class="card">
      <h2>{{ $t('settings.about') }}</h2>
      <div class="kv">
        <i>{{ $t('app.title') }}</i><b class="num">{{ pkg.version }}</b>
        <i>ugclient-core</i><b class="num">{{ engine.hello?.core_version ?? '—' }}</b>
        <i>ufactory_genesis</i>
        <b class="num">{{ engine.hello ? `${engine.hello.ufactory_genesis_version} (${engine.hello.ufactory_genesis_commit})` : '—' }}</b>
        <i>Pinocchio</i><b class="num">{{ engine.hello?.pinocchio_version ?? '—' }}</b>
        <i>{{ $t('settings.license') }}</i><b>MIT</b>
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
.card h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--uc-ink-strong);
}
.row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.row > span {
  width: 190px;
  color: var(--uc-ink-muted);
  font-weight: 600;
}
.kv {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  gap: 10px 12px;
  font-size: 13px;
}
.kv i {
  font-style: normal;
  color: var(--uc-ink-muted);
}
.kv b {
  font-weight: 600;
  color: var(--uc-ink-strong);
}
</style>
