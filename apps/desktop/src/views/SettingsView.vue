<script setup lang="ts">
// Secondary Settings page with Studio-style 5-category sidebar, search filter, and scrollable content pane.
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import MotionSettingsPage from '../components/settings/MotionSettingsPage.vue'
import ExternalsSettingsPage from '../components/settings/ExternalsSettingsPage.vue'
import SafetySettingsPage from '../components/settings/SafetySettingsPage.vue'
import GeneralSettingsPage from '../components/settings/GeneralSettingsPage.vue'
import MyDeviceSettingsPage from '../components/settings/MyDeviceSettingsPage.vue'

type SettingsCategory = 'motion' | 'externals' | 'safety' | 'general' | 'device'

const emit = defineEmits<{ (e: 'back'): void }>()
const { t } = useI18n()

const activeCategory = ref<SettingsCategory>('motion')
const search = ref('')
const paneRef = ref<HTMLElement | null>(null)

interface CategoryItem {
  id: SettingsCategory
  labelKey: string
  keywords: string
}

const categories: CategoryItem[] = [
  {
    id: 'motion',
    labelKey: 'settings.nav.motion',
    keywords: 'motion joint line position attitude step collision sensitivity initial tcp payload weight offset coordinates base mounting floor ceiling wall tilt rotate 运动 关节 直线 步长 碰撞 初始 负载 偏移 坐标系 安装 正装 倒装 壁装',
  },
  {
    id: 'externals',
    labelKey: 'settings.nav.externals',
    keywords: 'externals io gripper vacuum sensor track 外接设备 夹爪 力传感器 滑台',
  },
  {
    id: 'safety',
    labelKey: 'settings.nav.safety',
    keywords: 'safety boundary limits reduced fence collision 安全 边界 限位 缩减 自碰撞',
  },
  {
    id: 'general',
    labelKey: 'settings.nav.general',
    keywords: 'general language default robot session restore about version license 通用 语言 默认机型 恢复 关于 版本',
  },
  {
    id: 'device',
    labelKey: 'settings.nav.device',
    keywords: 'my device controller ip firmware sn serial engine diagnostics 我的设备 控制器 固件 序列号 引擎',
  },
]

const filteredCategories = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return categories
  return categories.filter((c) => t(c.labelKey).toLowerCase().includes(q) || c.keywords.toLowerCase().includes(q))
})

function selectCategory(id: SettingsCategory) {
  activeCategory.value = id
  if (paneRef.value) paneRef.value.scrollTop = 0
}
</script>

<template>
  <div class="settings-shell" data-test="settings-view">
    <aside class="settings-sidebar">
      <div class="sidebar-top">
        <button type="button" class="back-btn" data-test="settings-back" @click="emit('back')">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M10.5 3.5L6 8l4.5 4.5M6 8h7"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          <span>{{ $t('settings.back') }}</span>
        </button>

        <div class="search-box">
          <input
            v-model="search"
            type="text"
            class="search-input"
            :placeholder="$t('settings.searchPlaceholder')"
            data-test="settings-search"
          />
          <svg class="search-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
            <path d="M10.5 10.5L13.5 13.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
        </div>
      </div>

      <nav class="sidebar-nav" :aria-label="$t('settings.title')">
        <template v-for="cat in filteredCategories" :key="cat.id">
          <button
            type="button"
            class="nav-item"
            :class="{ active: activeCategory === cat.id }"
            :data-test="`settings-nav-${cat.id}`"
            @click="selectCategory(cat.id)"
          >
            <svg v-if="cat.id === 'motion'" class="nav-ico" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <circle cx="4" cy="12" r="2" fill="none" stroke="currentColor" stroke-width="1.5" />
              <circle cx="8" cy="5" r="2" fill="none" stroke="currentColor" stroke-width="1.5" />
              <circle cx="12.5" cy="11" r="1.5" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path d="M5 10.3L7 6.7M9.6 6.2L11.5 9.7" fill="none" stroke="currentColor" stroke-width="1.5" />
            </svg>
            <svg v-else-if="cat.id === 'externals'" class="nav-ico" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <path
                d="M2.5 8h4M9.5 5v6M9.5 5.5H13M9.5 8H13.5M9.5 10.5H13"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            <svg v-else-if="cat.id === 'safety'" class="nav-ico" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <path
                d="M8 2.2l4.8 1.9v3.7c0 3-2 5.2-4.8 6.1C5.2 13 3.2 10.8 3.2 7.8V4.1L8 2.2z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linejoin="round"
              />
              <path d="M5.8 8l1.6 1.6 3-3.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <svg v-else-if="cat.id === 'general'" class="nav-ico" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" />
              <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" />
              <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" />
              <rect x="9" y="9" width="4.5" height="4.5" rx="1" fill="none" stroke="currentColor" stroke-width="1.5" />
            </svg>
            <svg v-else class="nav-ico" viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
              <circle cx="8" cy="5.5" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5" />
              <path
                d="M3.2 13.3c.6-2.4 2.5-3.6 4.8-3.6s4.2 1.2 4.8 3.6"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
            <span class="nav-label">{{ $t(cat.labelKey) }}</span>
          </button>
        </template>

        <p v-if="filteredCategories.length === 0" class="no-match">
          {{ $t('settings.noMatches') }}
        </p>
      </nav>
    </aside>

    <main ref="paneRef" class="settings-content">
      <div class="settings-container">
        <MotionSettingsPage v-if="activeCategory === 'motion'" />
        <ExternalsSettingsPage v-else-if="activeCategory === 'externals'" />
        <SafetySettingsPage v-else-if="activeCategory === 'safety'" />
        <GeneralSettingsPage v-else-if="activeCategory === 'general'" />
        <MyDeviceSettingsPage v-else />
      </div>
    </main>
  </div>
</template>

<style scoped>
.settings-shell {
  height: 100%;
  display: flex;
  min-width: 0;
  min-height: 0;
  background: var(--uc-app-bg);
}
.settings-sidebar {
  width: 224px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--uc-panel-bg);
  border-right: 1px solid var(--uc-border);
  padding: 16px 14px;
  gap: 14px;
  box-sizing: border-box;
  overflow-y: auto;
}
.sidebar-top {
  display: grid;
  gap: 12px;
}
.back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: fit-content;
  min-width: 108px;
  height: 36px;
  padding: 0 16px;
  border: 0;
  border-radius: 4px;
  background: var(--uc-primary);
  color: #fff;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color 0.15s ease;
}
.back-btn:hover {
  background: var(--uc-primary-hover);
}
.search-box {
  position: relative;
  display: flex;
  align-items: center;
}
.search-input {
  width: 100%;
  height: 34px;
  padding: 0 30px 0 12px;
  border: 1px solid var(--uc-border);
  border-radius: 17px;
  background: var(--uc-surface-muted);
  color: var(--uc-ink);
  font: inherit;
  font-size: 12px;
  box-sizing: border-box;
}
.search-input:focus {
  outline: none;
  border-color: var(--uc-primary);
  background: #fff;
}
.search-icon {
  position: absolute;
  right: 11px;
  color: var(--uc-ink-muted);
  pointer-events: none;
}
.sidebar-nav {
  display: grid;
  gap: 4px;
}
.nav-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--uc-ink-muted);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}
.nav-item:hover {
  background: var(--uc-surface-muted);
  color: var(--uc-ink-strong);
}
.nav-item.active {
  color: var(--uc-primary);
  background: var(--uc-primary-soft);
}
.nav-ico {
  flex: none;
}
.nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.no-match {
  margin: 8px 4px;
  font-size: 12px;
  color: var(--uc-ink-muted);
}
.settings-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 28px 36px;
  box-sizing: border-box;
}
.settings-container {
  max-width: 960px;
  margin: 0 auto;
}
@media (max-width: 780px) {
  .settings-shell {
    flex-direction: column;
  }
  .settings-sidebar {
    width: 100%;
    border-right: 0;
    border-bottom: 1px solid var(--uc-border);
  }
  .settings-content {
    padding: 14px;
  }
}
</style>
