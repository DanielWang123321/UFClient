<script setup lang="ts">
// UFClient brand mark: stylized articulated 2-link arm + TCP target beside the UFClient wordmark.
import { useId } from 'vue'

withDefaults(defineProps<{ size?: number }>(), { size: 26 })

const gradId = useId()
</script>

<template>
  <div class="app-logo" data-test="app-logo">
    <svg
      class="logo-mark"
      :width="size"
      :height="size"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient :id="gradId" x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="#0f172a" />
          <stop offset="52%" stop-color="#17325c" />
          <stop offset="100%" stop-color="#1f6fd1" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" :fill="`url(#${gradId})`" />
      <rect x="1.5" y="1.5" width="29" height="29" rx="7.5" stroke="#ffffff" stroke-opacity="0.16" />
      <rect x="6.5" y="23.5" width="11" height="2.6" rx="1.3" fill="#93c5fd" />
      <path
        d="M12 23.5V16.8L18.4 10.6L23.2 12.8"
        stroke="#ffffff"
        stroke-width="2.6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="12" cy="16.8" r="2.3" fill="#ffffff" />
      <circle cx="12" cy="16.8" r="1.0" fill="#17325c" />
      <circle cx="18.4" cy="10.6" r="2.2" fill="#ffffff" />
      <circle cx="18.4" cy="10.6" r="0.95" fill="#17325c" />
      <circle cx="24" cy="13.2" r="2.7" fill="#38bdf8" />
      <circle cx="24" cy="13.2" r="1.15" fill="#ffffff" />
    </svg>
    <span class="brand-wordmark" data-test="brand-title"><span class="brand-uf">UF</span><span class="brand-client">Client</span></span>
  </div>
</template>

<style scoped>
.app-logo {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  user-select: none;
  flex: none;
}
.logo-mark {
  display: block;
  flex: none;
  border-radius: 6px;
}
.brand-wordmark {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1;
  white-space: nowrap;
}
.brand-uf {
  color: var(--uc-primary);
}
.brand-client {
  color: var(--uc-ink-strong);
}
</style>
