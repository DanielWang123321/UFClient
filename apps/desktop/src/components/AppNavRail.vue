<script lang="ts">
export type AppPage = 'live' | 'blockly' | 'python' | 'gcode' | 'settings'
</script>

<script setup lang="ts">
// Narrow left primary navigation rail with feature pages above and Settings pinned bottom-left.
const props = defineProps<{ active: AppPage }>()
const emit = defineEmits<{ (e: 'select', page: AppPage): void }>()

const primaryItems: readonly Exclude<AppPage, 'settings'>[] = ['live', 'blockly', 'python', 'gcode']
</script>

<template>
  <aside class="app-rail" data-test="app-nav-rail">
    <nav class="rail-top" aria-label="Primary">
      <button
        v-for="id in primaryItems"
        :key="id"
        type="button"
        class="rail-btn"
        :class="{ active: props.active === id }"
        :aria-current="props.active === id ? 'page' : undefined"
        :data-test="`nav-${id}`"
        @click="emit('select', id)"
      >
        <svg v-if="id === 'live'" class="rail-ico" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M10 4.8L8.4 6.8h3.2L10 4.8zM10 15.2l-1.6-2h3.2l-1.6 2zM4.8 10l2-1.6v3.2l-2-1.6zM15.2 10l-2-1.6v3.2l2-1.6z" fill="currentColor" />
          <circle cx="10" cy="10" r="1.4" fill="currentColor" />
        </svg>
        <svg v-else-if="id === 'blockly'" class="rail-ico" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <path
            d="M4 5.5A1.5 1.5 0 0 1 5.5 4h2.2a1.7 1.7 0 0 1 3.3 0h2.5A1.5 1.5 0 0 1 15 5.5v2.2a1.7 1.7 0 0 1 0 3.3v3.5a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 4 14.5v-9z"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
        </svg>
        <svg v-else-if="id === 'python'" class="rail-ico" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <path
            d="M7.2 6.5L3.8 10l3.4 3.5M12.8 6.5L16.2 10l-3.4 3.5M11.2 5l-2.4 10"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <svg v-else class="rail-ico" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <path
            d="M14.5 7A5 5 0 1 0 15 11.2h-4.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="rail-label">{{ $t(`nav.${id}`) }}</span>
      </button>
    </nav>

    <div class="rail-bottom">
      <button
        type="button"
        class="rail-btn"
        :class="{ active: props.active === 'settings' }"
        :aria-current="props.active === 'settings' ? 'page' : undefined"
        :title="$t('nav.settings')"
        :aria-label="$t('nav.settings')"
        data-test="nav-settings"
        @click="emit('select', 'settings')"
      >
        <svg class="rail-ico" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <circle cx="10" cy="10" r="2.7" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path
            d="M10 2.7v1.8M10 15.5v1.8M2.7 10h1.8M15.5 10h1.8M4.8 4.8l1.3 1.3M13.9 13.9l1.3 1.3M15.2 4.8l-1.3 1.3M6.1 13.9l-1.3 1.3"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
          <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" stroke-width="1.35" stroke-dasharray="2.4 1.8" />
        </svg>
        <span class="rail-label">{{ $t('nav.settings') }}</span>
      </button>
    </div>
  </aside>
</template>

<style scoped>
.app-rail {
  width: 68px;
  flex: none;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 10px 6px;
  box-sizing: border-box;
  background: var(--uc-panel-bg);
  border-right: 1px solid var(--uc-border);
  user-select: none;
}
.rail-top {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rail-bottom {
  padding-top: 10px;
  border-top: 1px solid var(--uc-border);
  display: flex;
  flex-direction: column;
}
.rail-btn {
  width: 100%;
  padding: 8px 4px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--uc-ink-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font: inherit;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1.15;
  text-align: center;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.rail-btn:hover {
  background: var(--uc-surface-muted);
  color: var(--uc-ink-strong);
}
.rail-btn.active {
  background: var(--uc-primary);
  color: #fff;
}
.rail-ico {
  flex: none;
}
.rail-label {
  max-width: 100%;
  word-break: break-word;
}
</style>
