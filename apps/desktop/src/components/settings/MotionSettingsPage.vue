<script setup lang="ts">
// Unified Motion Settings page (Parameters / TCP / Coordinates) matching UFACTORY Studio structure
// and UGClient's light neutral industrial style. Physical controller parameters are strictly read-only.
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { MOTION } from '../../lib/motion'
import { MOUNTING_PRESETS } from '../../lib/mounting'
import { fmt } from '../../lib/units'
import { useRobotStore } from '../../stores/robot'
import { useRealStore } from '../../stores/real'
import { useSettingsStore, type Pose6Tuple } from '../../stores/settings'

const { t } = useI18n()
const robot = useRobotStore()
const real = useRealStore()
const settings = useSettingsStore()

const dof = computed(() => robot.info?.dof ?? (robot.q.length || real.dof || 6))
const initialPos = computed(() => settings.initialPositionFor(robot.key, dof.value))

// Inline editor state for Initial Position (simulation only)
const editingInit = ref(false)
const initDraft = ref<number[]>([])

function jointLimitsFor(i: number): [number, number] {
  return robot.info?.limits_deg?.[i] ?? [-360, 360]
}

function toggleInitEditor() {
  if (real.connected) return
  if (!editingInit.value) {
    initDraft.value = [...initialPos.value]
    editingInit.value = true
  } else {
    editingInit.value = false
  }
}

function useCurrentAsInit() {
  initDraft.value = robot.q.slice(0, dof.value).map((v) => Math.round(v * 10) / 10)
}

function zeroInitDraft() {
  initDraft.value = Array(dof.value).fill(0)
}

function applyInitDraft() {
  if (real.connected) return
  settings.setInitialPosition(robot.key, initDraft.value)
  editingInit.value = false
}

// Drafts for TCP Payload & Offset
const payloadMass = ref(robot.payload.mass_kg)
const payloadCom = ref<[number, number, number]>([
  robot.payload.com_mm[0] ?? 0,
  robot.payload.com_mm[1] ?? 0,
  robot.payload.com_mm[2] ?? 0,
])
const tcpDraft = ref<Pose6Tuple>([
  robot.tcpOffset[0] ?? 0,
  robot.tcpOffset[1] ?? 0,
  robot.tcpOffset[2] ?? 0,
  robot.tcpOffset[3] ?? 0,
  robot.tcpOffset[4] ?? 0,
  robot.tcpOffset[5] ?? 0,
])

watch(
  () => robot.payload,
  (p) => {
    payloadMass.value = p.mass_kg
    payloadCom.value = [p.com_mm[0] ?? 0, p.com_mm[1] ?? 0, p.com_mm[2] ?? 0]
  },
  { deep: true },
)

watch(
  () => robot.tcpOffset,
  (o) => {
    tcpDraft.value = [o[0] ?? 0, o[1] ?? 0, o[2] ?? 0, o[3] ?? 0, o[4] ?? 0, o[5] ?? 0]
  },
  { deep: true },
)

const selectedTcpPreset = ref('current')
const creatingTcpPreset = ref(false)
const newTcpPresetName = ref('')

const tcpPresetOptions = computed(() => {
  const list: { value: string; label: string; custom?: boolean }[] = [
    { value: 'current', label: t('settings.motion.currentPreset') },
    { value: 'flange', label: t('tcp.flange') },
  ]
  const info = robot.info
  if (info && info.end_effector !== 'none') {
    list.push({
      value: 'toolDefault',
      label: `${t(`ee.${info.end_effector}`)} (${t('tcp.toolDefault')})`,
    })
  }
  for (const p of settings.tcpPresets) {
    list.push({ value: `user:${p.id}`, label: p.name, custom: true })
  }
  return list
})

const activeUserTcpId = computed(() =>
  selectedTcpPreset.value.startsWith('user:') ? selectedTcpPreset.value.slice(5) : '',
)

function onSelectTcpPreset(val: string) {
  if (real.connected) return
  if (val === 'current') {
    payloadMass.value = robot.payload.mass_kg
    payloadCom.value = [robot.payload.com_mm[0] ?? 0, robot.payload.com_mm[1] ?? 0, robot.payload.com_mm[2] ?? 0]
    tcpDraft.value = [
      robot.tcpOffset[0] ?? 0,
      robot.tcpOffset[1] ?? 0,
      robot.tcpOffset[2] ?? 0,
      robot.tcpOffset[3] ?? 0,
      robot.tcpOffset[4] ?? 0,
      robot.tcpOffset[5] ?? 0,
    ]
    return
  }
  if (val === 'flange') {
    tcpDraft.value = [0, 0, 0, 0, 0, 0]
    return
  }
  if (val === 'toolDefault' && robot.info) {
    const o = robot.info.default_tcp_offset
    tcpDraft.value = [o[0] ?? 0, o[1] ?? 0, o[2] ?? 0, o[3] ?? 0, o[4] ?? 0, o[5] ?? 0]
    return
  }
  if (val.startsWith('user:')) {
    const found = settings.tcpPresets.find((p) => p.id === val.slice(5))
    if (found) {
      payloadMass.value = found.massKg
      payloadCom.value = [...found.comMm]
      tcpDraft.value = [...found.offset]
    }
  }
}

function saveNewTcpPreset() {
  if (real.connected) return
  const created = settings.addTcpPreset({
    name: newTcpPresetName.value || `TCP ${settings.tcpPresets.length + 1}`,
    massKg: payloadMass.value,
    comMm: [...payloadCom.value],
    offset: [...tcpDraft.value],
  })
  selectedTcpPreset.value = `user:${created.id}`
  newTcpPresetName.value = ''
  creatingTcpPreset.value = false
}

function deleteSelectedTcpPreset() {
  if (!activeUserTcpId.value || real.connected) return
  settings.removeTcpPreset(activeUserTcpId.value)
  selectedTcpPreset.value = 'current'
}

async function applyTcpPayload() {
  if (real.connected) return
  await robot.applyPayload({ mass_kg: Math.max(0, Number(payloadMass.value) || 0), com_mm: [...payloadCom.value] })
  await robot.applyTcp([...tcpDraft.value])
}

// Drafts for Coordinates (Base Coordinate System / World Offset)
const coordDraft = ref<Pose6Tuple>([...settings.worldOffset])
watch(
  () => settings.worldOffset,
  (w) => {
    coordDraft.value = [...w]
  },
  { deep: true },
)

const selectedCoordPreset = ref('base')
const creatingCoordPreset = ref(false)
const newCoordPresetName = ref('')

const coordPresetOptions = computed(() => {
  const list: { value: string; label: string; custom?: boolean }[] = [
    { value: 'base', label: t('settings.motion.baseCoord') },
  ]
  for (const p of settings.coordPresets) {
    list.push({ value: `user:${p.id}`, label: p.name, custom: true })
  }
  return list
})

const activeUserCoordId = computed(() =>
  selectedCoordPreset.value.startsWith('user:') ? selectedCoordPreset.value.slice(5) : '',
)

const activeCoordLabel = computed(() => {
  if (!activeUserCoordId.value) return t('settings.motion.baseCoord')
  return settings.coordPresets.find((p) => p.id === activeUserCoordId.value)?.name ?? t('settings.motion.baseCoord')
})

function onSelectCoordPreset(val: string) {
  if (real.connected) return
  if (val === 'base') {
    coordDraft.value = [0, 0, 0, 0, 0, 0]
    return
  }
  if (val.startsWith('user:')) {
    const found = settings.coordPresets.find((p) => p.id === val.slice(5))
    if (found) coordDraft.value = [...found.offset]
  }
}

function saveNewCoordPreset() {
  if (real.connected) return
  const created = settings.addCoordPreset({
    name: newCoordPresetName.value || `Coord ${settings.coordPresets.length + 1}`,
    offset: [...coordDraft.value],
  })
  selectedCoordPreset.value = `user:${created.id}`
  newCoordPresetName.value = ''
  creatingCoordPreset.value = false
}

function deleteSelectedCoordPreset() {
  if (!activeUserCoordId.value || real.connected) return
  settings.removeCoordPreset(activeUserCoordId.value)
  selectedCoordPreset.value = 'base'
}

function applyWorldCoord() {
  if (real.connected) return
  settings.setWorldOffset([...coordDraft.value])
}

// Mounting helpers
const mountingButtons = computed(() => [
  { id: 'floor' as const, label: t('settings.motion.mountFloor') },
  { id: 'ceiling' as const, label: t('settings.motion.mountCeiling') },
  { id: 'wallUp' as const, label: t('settings.motion.mountWallUp') },
  { id: 'wallDown' as const, label: t('settings.motion.mountWallDown') },
  { id: 'custom' as const, label: t('settings.motion.mountCustom') },
])

const rotateDisabled = computed(
  () => Math.abs(settings.mounting.tiltDeg) < 0.05 || Math.abs(settings.mounting.tiltDeg - 180) < 0.05,
)

function onTiltChange(v: number | undefined) {
  if (real.connected || v === undefined) return
  settings.setMountingAngles(v, settings.mounting.rotateDeg, false)
}

function onRotateChange(v: number | undefined) {
  if (real.connected || rotateDisabled.value || v === undefined) return
  settings.setMountingAngles(settings.mounting.tiltDeg, v, false)
}

function nudgeTilt(delta: number) {
  onTiltChange(settings.mounting.tiltDeg + delta)
}

function nudgeRotate(delta: number) {
  onRotateChange(settings.mounting.rotateDeg + delta)
}

// Range slider event helpers
function onJointStepInput(e: Event) {
  settings.setJointStepDeg((e.target as HTMLInputElement).valueAsNumber)
}
function onStepMmInput(e: Event) {
  settings.setStepMm((e.target as HTMLInputElement).valueAsNumber)
}
function onAttitudeStepInput(e: Event) {
  settings.setAttitudeStepDeg((e.target as HTMLInputElement).valueAsNumber)
}
function onSensitivityInput(e: Event) {
  if (real.connected) return
  settings.setCollisionSensitivity((e.target as HTMLInputElement).valueAsNumber)
}
function onTiltSliderInput(e: Event) {
  onTiltChange((e.target as HTMLInputElement).valueAsNumber)
}
function onRotateSliderInput(e: Event) {
  onRotateChange((e.target as HTMLInputElement).valueAsNumber)
}

watch(
  () => real.connected,
  (conn) => {
    if (conn) {
      editingInit.value = false
      creatingTcpPreset.value = false
      creatingCoordPreset.value = false
      selectedTcpPreset.value = 'current'
      selectedCoordPreset.value = 'base'
    }
  },
)

const PAYLOAD_COM_FIELDS = ['CX', 'CY', 'CZ'] as const
const POSE_FIELDS = [
  { label: 'X', unit: 'mm', key: 'x' },
  { label: 'Y', unit: 'mm', key: 'y' },
  { label: 'Z', unit: 'mm', key: 'z' },
  { label: 'Roll', unit: '°', key: 'roll' },
  { label: 'Pitch', unit: '°', key: 'pitch' },
  { label: 'Yaw', unit: '°', key: 'yaw' },
] as const
const SENSITIVITY_TICKS = [0, 1, 2, 3, 4, 5] as const
void MOUNTING_PRESETS
</script>

<template>
  <div class="motion-settings" data-test="settings-page-motion">
    <div v-if="real.connected" class="real-readonly-banner" data-test="real-readonly-banner">
      <span>{{ $t('settings.readOnlyRealBanner', { ip: real.ip }) }}</span>
      <button
        type="button"
        class="uc-btn secondary"
        :disabled="real.refreshingSettings"
        data-test="real-refresh-settings"
        @click="real.refreshSettings()"
      >
        ↻ {{ real.refreshingSettings ? $t('settings.refreshing') : $t('settings.refreshFromRobot') }}
      </button>
    </div>

    <!-- Joint Motion -->
    <article class="card">
      <div class="card-head">
        <h2>{{ $t('settings.motion.jointMotion') }}</h2>
      </div>
      <div class="slider-row">
        <span class="row-label">{{ $t('settings.motion.jointStep') }}</span>
        <input
          type="range"
          class="uc-slider"
          :min="MOTION.stepDegRange[0]"
          :max="MOTION.stepDegRange[1]"
          step="0.1"
          :value="settings.jointStepDeg"
          @input="onJointStepInput"
        />
        <div class="num-unit">
          <el-input-number
            :model-value="settings.jointStepDeg"
            :min="MOTION.stepDegRange[0]"
            :max="MOTION.stepDegRange[1]"
            :step="0.1"
            :precision="2"
            :controls="false"
            class="pill-num"
            data-test="joint-step-deg"
            @change="settings.setJointStepDeg"
          />
          <span class="unit">°</span>
        </div>
      </div>
    </article>

    <!-- Line Motion -->
    <article class="card">
      <div class="card-head">
        <h2>{{ $t('settings.motion.lineMotion') }}</h2>
      </div>
      <div class="slider-stack">
        <div class="slider-row">
          <span class="row-label">{{ $t('settings.motion.positionStep') }}</span>
          <input
            type="range"
            class="uc-slider"
            :min="MOTION.stepMmRange[0]"
            :max="MOTION.stepMmRange[1]"
            step="0.5"
            :value="settings.stepMm"
            @input="onStepMmInput"
          />
          <div class="num-unit">
            <el-input-number
              :model-value="settings.stepMm"
              :min="MOTION.stepMmRange[0]"
              :max="MOTION.stepMmRange[1]"
              :step="0.5"
              :precision="2"
              :controls="false"
              class="pill-num"
              data-test="step-mm"
              @change="settings.setStepMm"
            />
            <span class="unit">mm</span>
          </div>
        </div>

        <div class="slider-row">
          <span class="row-label">{{ $t('settings.motion.attitudeStep') }}</span>
          <input
            type="range"
            class="uc-slider"
            :min="MOTION.stepDegRange[0]"
            :max="MOTION.stepDegRange[1]"
            step="0.1"
            :value="settings.attitudeStepDeg"
            @input="onAttitudeStepInput"
          />
          <div class="num-unit">
            <el-input-number
              :model-value="settings.attitudeStepDeg"
              :min="MOTION.stepDegRange[0]"
              :max="MOTION.stepDegRange[1]"
              :step="0.1"
              :precision="2"
              :controls="false"
              class="pill-num"
              data-test="attitude-step-deg"
              @change="settings.setAttitudeStepDeg"
            />
            <span class="unit">°</span>
          </div>
        </div>

        <p class="hint">
          {{
            $t('settings.jogHint', {
              ms: MOTION.longPressMs,
              linMin: MOTION.minLinearMmS,
              linMax: MOTION.maxLinearMmS,
              angMin: MOTION.minAngularDegS,
              tcpAngMax: MOTION.maxTcpAngularDegS,
              jointAngMax: MOTION.maxJointDegS,
            })
          }}
        </p>
      </div>
    </article>

    <!-- Collision Detection -->
    <article class="card">
      <div class="card-head">
        <h2>{{ $t('settings.motion.collisionDetection') }}</h2>
        <span v-if="real.connected" class="ro-tag">{{ $t('settings.motion.readOnlyTag') }}</span>
      </div>
      <div class="slider-row">
        <span class="row-label">{{ $t('settings.motion.sensitivity') }}</span>
        <div class="ticked-slider">
          <div class="ticks">
            <span v-for="n in SENSITIVITY_TICKS" :key="n" class="tick">{{ n }}</span>
          </div>
          <input
            type="range"
            class="uc-slider"
            min="0"
            max="5"
            step="1"
            :value="settings.collisionSensitivity"
            :disabled="real.connected"
            @input="onSensitivityInput"
          />
        </div>
        <div class="num-unit">
          <el-input-number
            :model-value="settings.collisionSensitivity"
            :min="0"
            :max="5"
            :step="1"
            :precision="0"
            :controls="false"
            :disabled="real.connected"
            class="pill-num"
            data-test="collision-sensitivity"
            @change="settings.setCollisionSensitivity"
          />
          <span class="unit" />
        </div>
      </div>
    </article>

    <!-- Initial Position -->
    <article class="card">
      <div class="card-head">
        <h2>{{ $t('settings.motion.initialPosition') }}</h2>
        <span v-if="real.connected" class="ro-tag">{{ $t('settings.motion.readOnlyTag') }}</span>
      </div>
      <div class="init-row">
        <div class="init-joints num" data-test="initial-pos-display">
          <span v-for="(val, i) in initialPos" :key="i" class="init-joint">
            J{{ i + 1 }}: {{ fmt(val, 1) }}°
          </span>
        </div>
        <button
          type="button"
          class="uc-btn primary"
          :disabled="real.connected"
          data-test="initial-pos-set"
          @click="toggleInitEditor"
        >
          {{ $t('settings.motion.set') }} ›
        </button>
      </div>

      <div v-if="editingInit && !real.connected" class="inline-drawer" data-test="initial-pos-editor">
        <div class="init-grid">
          <label v-for="i in dof" :key="i" class="inline-field">
            <span>J{{ i }} (°)</span>
            <el-input-number
              v-model="initDraft[i - 1]"
              :min="jointLimitsFor(i - 1)[0]"
              :max="jointLimitsFor(i - 1)[1]"
              :precision="1"
              :controls="false"
              :data-test="`init-j${i}`"
            />
          </label>
        </div>
        <div class="drawer-actions">
          <button type="button" class="uc-btn secondary" @click="useCurrentAsInit">
            {{ $t('settings.motion.useCurrentPose') }}
          </button>
          <button type="button" class="uc-btn secondary" @click="zeroInitDraft">
            {{ $t('settings.motion.resetZero') }}
          </button>
          <button type="button" class="uc-btn primary" data-test="initial-pos-apply" @click="applyInitDraft">
            {{ $t('tcp.apply') }}
          </button>
        </div>
      </div>
    </article>

    <!-- TCP Payload and Offset -->
    <article class="card">
      <div class="card-head split">
        <div class="head-left">
          <h2>{{ $t('settings.motion.tcpPayloadOffset') }}</h2>
          <span v-if="real.connected" class="ro-tag">{{ $t('settings.motion.readOnlyTag') }}</span>
        </div>
        <div class="head-actions">
          <button
            type="button"
            class="uc-btn primary"
            :disabled="real.connected"
            data-test="tcp-preset-new"
            @click="creatingTcpPreset = !creatingTcpPreset"
          >
            + {{ $t('settings.motion.newPreset') }}
          </button>
          <el-select
            v-model="selectedTcpPreset"
            size="small"
            class="preset-select"
            :disabled="real.connected"
            data-test="tcp-preset-select"
            @change="onSelectTcpPreset"
          >
            <el-option v-for="opt in tcpPresetOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
          <button
            v-if="activeUserTcpId && !real.connected"
            type="button"
            class="uc-btn icon-del"
            :title="$t('settings.motion.deletePreset')"
            @click="deleteSelectedTcpPreset"
          >
            ×
          </button>
        </div>
      </div>

      <div v-if="creatingTcpPreset && !real.connected" class="preset-bar">
        <input
          v-model="newTcpPresetName"
          type="text"
          class="uc-text-input"
          :placeholder="$t('settings.motion.presetNamePlaceholder')"
          data-test="tcp-preset-name"
        />
        <button type="button" class="uc-btn primary" data-test="tcp-preset-save" @click="saveNewTcpPreset">
          {{ $t('settings.motion.savePreset') }}
        </button>
        <button type="button" class="uc-btn secondary" @click="creatingTcpPreset = false">×</button>
      </div>

      <div class="sub-section">
        <h3>{{ $t('settings.motion.payload') }}</h3>
        <div class="fields-row">
          <label class="inline-num">
            <span class="fld-name">{{ $t('settings.motion.weight') }}</span>
            <el-input-number
              v-model="payloadMass"
              :min="0"
              :step="0.1"
              :precision="3"
              :controls="false"
              :disabled="real.connected"
              data-test="payload-mass"
            />
            <span class="unit">kg</span>
          </label>
          <label v-for="(cname, idx) in PAYLOAD_COM_FIELDS" :key="cname" class="inline-num">
            <span class="fld-name">{{ cname }}</span>
            <el-input-number
              v-model="payloadCom[idx]"
              :controls="false"
              :precision="1"
              :disabled="real.connected"
              :data-test="`payload-${cname.toLowerCase()}`"
            />
            <span class="unit">mm</span>
          </label>
        </div>
      </div>

      <hr class="card-divider" />

      <div class="sub-section">
        <h3>{{ $t('settings.motion.offset') }}</h3>
        <div class="fields-row">
          <label v-for="(f, idx) in POSE_FIELDS" :key="f.key" class="inline-num">
            <span class="fld-name">{{ f.label }}</span>
            <el-input-number
              v-model="tcpDraft[idx]"
              :controls="false"
              :precision="2"
              :disabled="real.connected"
              :data-test="`tcp-${f.key}`"
            />
            <span class="unit">{{ f.unit }}</span>
          </label>
        </div>
      </div>

      <div class="card-footer">
        <span class="hint">{{ $t('payload.hint') }} · {{ $t('tcp.hint') }}</span>
        <button
          v-if="!real.connected"
          type="button"
          class="uc-btn primary"
          data-test="tcp-payload-apply"
          @click="applyTcpPayload"
        >
          {{ $t('tcp.apply') }}
        </button>
      </div>
    </article>

    <!-- Coordinates & Mounting -->
    <!-- Coordinates -->
    <article class="card">
      <div class="card-head split">
        <div class="head-left">
          <h2>{{ $t('settings.motion.coordinates') }}</h2>
          <span v-if="real.connected" class="ro-tag">{{ $t('settings.motion.readOnlyTag') }}</span>
        </div>
        <div class="head-actions">
          <button
            type="button"
            class="uc-btn primary"
            :disabled="real.connected"
            data-test="coord-preset-new"
            @click="creatingCoordPreset = !creatingCoordPreset"
          >
            + {{ $t('settings.motion.newPreset') }}
          </button>
          <el-select
            v-model="selectedCoordPreset"
            size="small"
            class="preset-select"
            :disabled="real.connected"
            data-test="coord-preset-select"
            @change="onSelectCoordPreset"
          >
            <el-option v-for="opt in coordPresetOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
          <button
            v-if="activeUserCoordId && !real.connected"
            type="button"
            class="uc-btn icon-del"
            :title="$t('settings.motion.deletePreset')"
            @click="deleteSelectedCoordPreset"
          >
            ×
          </button>
        </div>
      </div>

      <div v-if="creatingCoordPreset && !real.connected" class="preset-bar">
        <input
          v-model="newCoordPresetName"
          type="text"
          class="uc-text-input"
          :placeholder="$t('settings.motion.presetNamePlaceholder')"
          data-test="coord-preset-name"
        />
        <button type="button" class="uc-btn primary" data-test="coord-preset-save" @click="saveNewCoordPreset">
          {{ $t('settings.motion.savePreset') }}
        </button>
        <button type="button" class="uc-btn secondary" @click="creatingCoordPreset = false">×</button>
      </div>

      <div class="sub-section">
        <h3>{{ activeCoordLabel }}</h3>
        <div class="fields-row">
          <label v-for="(f, idx) in POSE_FIELDS" :key="f.key" class="inline-num">
            <span class="fld-name">{{ f.label }}</span>
            <el-input-number
              v-model="coordDraft[idx]"
              :controls="false"
              :precision="2"
              :disabled="real.connected"
              :data-test="`coord-${f.key}`"
            />
            <span class="unit">{{ f.unit }}</span>
          </label>
        </div>
      </div>

      <div v-if="!real.connected" class="card-footer end-only">
        <button type="button" class="uc-btn primary" data-test="coord-apply" @click="applyWorldCoord">
          {{ $t('tcp.apply') }}
        </button>
      </div>
    </article>

    <!-- Mounting -->
    <article class="card">
      <div class="card-head">
        <h2>{{ $t('settings.motion.mounting') }}</h2>
        <span v-if="real.connected" class="ro-tag">{{ $t('settings.motion.readOnlyTag') }}</span>
      </div>

      <div class="mount-presets">
        <button
          v-for="m in mountingButtons"
          :key="m.id"
          type="button"
          class="mount-btn"
          :class="{ active: settings.mounting.preset === m.id }"
          :disabled="real.connected"
          :data-test="`mount-${m.id}`"
          @click="settings.setMountingPreset(m.id)"
        >
          {{ m.label }}
        </button>
      </div>

      <div class="mount-sliders">
        <div class="mount-angle-block">
          <span class="angle-lbl">{{ $t('settings.motion.tiltAngle') }}:</span>
          <div class="angle-ctrl">
            <input
              type="range"
              class="uc-slider"
              min="0"
              max="180"
              step="1"
              :value="settings.mounting.tiltDeg"
              :disabled="real.connected"
              @input="onTiltSliderInput"
            />
            <div class="stepper">
              <button type="button" class="step-btn" :disabled="real.connected || settings.mounting.tiltDeg <= 0" @click="nudgeTilt(-1)">
                −
              </button>
              <el-input-number
                :model-value="settings.mounting.tiltDeg"
                :min="0"
                :max="180"
                :step="1"
                :precision="1"
                :controls="false"
                :disabled="real.connected"
                class="stepper-num"
                data-test="mount-tilt"
                @change="onTiltChange"
              />
              <button type="button" class="step-btn" :disabled="real.connected || settings.mounting.tiltDeg >= 180" @click="nudgeTilt(1)">
                +
              </button>
              <span class="unit">°</span>
            </div>
          </div>
        </div>

        <div class="mount-angle-block" :class="{ muted: rotateDisabled || real.connected }">
          <span class="angle-lbl">{{ $t('settings.motion.rotateAngle') }}:</span>
          <div class="angle-ctrl">
            <input
              type="range"
              class="uc-slider"
              min="-180"
              max="180"
              step="1"
              :value="settings.mounting.rotateDeg"
              :disabled="real.connected || rotateDisabled"
              @input="onRotateSliderInput"
            />
            <div class="stepper">
              <button
                type="button"
                class="step-btn"
                :disabled="real.connected || rotateDisabled || settings.mounting.rotateDeg <= -180"
                @click="nudgeRotate(-1)"
              >
                −
              </button>
              <el-input-number
                :model-value="settings.mounting.rotateDeg"
                :min="-180"
                :max="180"
                :step="1"
                :precision="1"
                :controls="false"
                :disabled="real.connected || rotateDisabled"
                class="stepper-num"
                data-test="mount-rotate"
                @change="onRotateChange"
              />
              <button
                type="button"
                class="step-btn"
                :disabled="real.connected || rotateDisabled || settings.mounting.rotateDeg >= 180"
                @click="nudgeRotate(1)"
              >
                +
              </button>
              <span class="unit">°</span>
            </div>
          </div>
        </div>
      </div>
    </article>
  </div>
</template>

<style scoped>
.motion-settings {
  display: grid;
  gap: 14px;
}
.real-readonly-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border: 1px solid var(--el-color-primary-light-5);
  border-left: 3px solid var(--uc-primary);
  border-radius: 4px;
  background: var(--uc-primary-soft);
  color: var(--uc-ink);
  font-size: 12.5px;
}
.card {
  background: var(--uc-panel-bg);
  border: 1px solid var(--uc-border);
  border-radius: 4px;
  padding: 18px 22px;
  display: grid;
  gap: 14px;
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.card-head.split {
  flex-wrap: wrap;
}
.head-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.card-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--uc-ink-strong);
}
.ro-tag {
  padding: 2px 8px;
  border-radius: 3px;
  background: var(--uc-surface-muted);
  border: 1px solid var(--uc-border);
  color: var(--uc-ink-muted);
  font-size: 11px;
  font-weight: 600;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.preset-select {
  width: 190px;
}
.preset-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 4px;
  background: var(--uc-surface-muted);
  border: 1px solid var(--uc-border);
}
.uc-text-input {
  flex: 1;
  min-width: 140px;
  height: 28px;
  padding: 0 9px;
  border: 1px solid var(--uc-border-strong);
  border-radius: 3px;
  background: #fff;
  color: var(--uc-ink-strong);
  font: inherit;
  font-size: 12px;
}
.slider-stack {
  display: grid;
  gap: 12px;
}
.slider-row {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr) 104px;
  align-items: center;
  gap: 16px;
}
.row-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--uc-ink-muted);
}
.uc-slider {
  width: 100%;
  accent-color: var(--uc-primary);
  cursor: pointer;
}
.uc-slider:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.ticked-slider {
  display: grid;
  gap: 4px;
}
.ticks {
  display: flex;
  justify-content: space-between;
  padding: 0 4px;
  font-size: 10.5px;
  color: var(--uc-ink-muted);
}
.num-unit {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}
.pill-num {
  width: 68px;
}
.pill-num :deep(.el-input__wrapper) {
  background: var(--uc-primary);
  box-shadow: none;
  border-radius: 3px;
}
.pill-num :deep(.el-input__inner) {
  color: #fff;
  font-weight: 700;
  text-align: center;
}
.pill-num.is-disabled :deep(.el-input__wrapper) {
  background: var(--uc-surface-muted);
  border: 1px solid var(--uc-border);
}
.pill-num.is-disabled :deep(.el-input__inner) {
  color: var(--uc-ink-muted);
}
.unit {
  width: 24px;
  font-size: 12px;
  color: var(--uc-ink-muted);
}
.init-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.init-joints {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 20px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--uc-ink);
}
.inline-drawer {
  display: grid;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--uc-border);
}
.init-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px 12px;
}
.inline-field {
  display: grid;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--uc-ink-muted);
}
.drawer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.sub-section {
  display: grid;
  gap: 10px;
}
.sub-section h3 {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--uc-ink);
}
.fields-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  align-items: center;
}
.inline-num {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.inline-num :deep(.el-input-number) {
  width: 78px;
}
.fld-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--uc-ink-muted);
}
.card-divider {
  border: 0;
  border-top: 1px solid var(--uc-border);
  margin: 2px 0;
}
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 4px;
}
.card-footer.end-only {
  justify-content: flex-end;
}
.mount-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.mount-btn {
  min-width: 146px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--uc-border);
  border-radius: 4px;
  background: var(--uc-surface-muted);
  color: var(--uc-ink);
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.mount-btn:hover:not(:disabled) {
  border-color: var(--uc-primary);
  color: var(--uc-primary);
}
.mount-btn.active {
  background: var(--uc-primary);
  border-color: var(--uc-primary);
  color: #fff;
}
.mount-btn:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.mount-sliders {
  display: grid;
  gap: 14px;
  margin-top: 4px;
}
.mount-angle-block {
  display: grid;
  gap: 6px;
}
.mount-angle-block.muted .angle-lbl {
  color: var(--uc-ink-muted);
}
.angle-lbl {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--uc-ink);
}
.angle-ctrl {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 18px;
}
.stepper {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.step-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--uc-border);
  border-radius: 3px;
  background: var(--uc-surface-muted);
  color: var(--uc-ink);
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.step-btn:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}
.stepper-num {
  width: 68px;
}
.uc-btn {
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--uc-border-strong);
  border-radius: 4px;
  background: #fff;
  color: var(--uc-ink);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
}
.uc-btn.primary {
  background: var(--uc-primary);
  border-color: var(--uc-primary);
  color: #fff;
}
.uc-btn.primary:hover:not(:disabled) {
  background: var(--uc-primary-hover);
}
.uc-btn.secondary {
  background: var(--uc-surface-muted);
}
.uc-btn.icon-del {
  width: 28px;
  padding: 0;
  color: var(--uc-danger);
}
.uc-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
@media (max-width: 680px) {
  .slider-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .angle-ctrl {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
