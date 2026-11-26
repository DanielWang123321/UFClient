<script setup lang="ts">
// My Device Settings sub-page: placeholder banner for diagnostics + read-only controller/engine summary.
import { useEngineStore } from '../../stores/engine'
import { useRealStore } from '../../stores/real'
import { robotDisplayName, useRobotStore } from '../../stores/robot'

const engine = useEngineStore()
const real = useRealStore()
const robot = useRobotStore()
</script>

<template>
  <div class="subpage" data-test="settings-page-device">
    <div class="planned-banner">
      <div class="planned-head">
        <strong>{{ $t('settings.device.title') }}</strong>
        <span class="badge">{{ $t('settings.placeholderBadge') }}</span>
      </div>
      <p>{{ $t('settings.device.plannedDesc') }}</p>
    </div>

    <article class="card">
      <h2>{{ real.connected ? $t('settings.device.controllerTitle') : $t('settings.device.localTitle') }}</h2>

      <div v-if="real.connected" class="kv">
        <i>{{ $t('settings.device.ip') }}</i><b class="num">{{ real.ip }}</b>
        <i>{{ $t('real.model') }}</i><b>{{ robotDisplayName(real.robotKey) }} ({{ real.dof }} DOF)</b>
        <i>{{ $t('real.firmware') }}</i><b class="num">{{ real.version || '—' }}</b>
        <i>{{ $t('settings.device.sn') }}</i><b class="num">{{ real.sn || '—' }}</b>
        <i>{{ $t('real.motorEnable') }}</i><b>{{ real.enabled ? $t('real.enabled') : $t('real.disabled') }}</b>
        <i>{{ $t('real.stateMode') }}</i><b class="num">state={{ real.state }} / mode={{ real.mode }}</b>
        <i>{{ $t('real.errWarn') }}</i><b class="num">err={{ real.errorCode }} / warn={{ real.warnCode }}</b>
        <template v-if="real.isSimulationRobot">
          <i>{{ $t('real.simRobotFlag') }}</i><b>ON</b>
        </template>
      </div>

      <div v-else class="kv">
        <i>{{ $t('info.state') }}</i><b>{{ $t('settings.device.notConnected') }}</b>
        <i>{{ $t('robot.model') }}</i><b>{{ robotDisplayName(robot.key) }}</b>
        <i>ugclient-core</i><b class="num">{{ engine.hello?.core_version ?? '—' }}</b>
        <i>ufactory_genesis</i>
        <b class="num">{{ engine.hello ? `${engine.hello.ufactory_genesis_version} (${engine.hello.ufactory_genesis_commit})` : '—' }}</b>
        <i>Pinocchio</i><b class="num">{{ engine.hello?.pinocchio_version ?? '—' }}</b>
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
