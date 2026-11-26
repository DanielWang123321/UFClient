<script setup lang="ts">
// Planned feature placeholder view shown for Blockly, Python, and GCode navigation entries.
const props = defineProps<{ feature: 'blockly' | 'python' | 'gcode' }>()
</script>

<template>
  <div class="placeholder-page" data-test="feature-placeholder" :data-feature="props.feature">
    <article class="card">
      <div class="head">
        <h2>{{ $t(`nav.${props.feature}`) }}</h2>
        <span class="badge">{{ $t('settings.placeholderBadge') }}</span>
      </div>
      <p class="desc">{{ $t(`featurePlaceholder.${props.feature}`) }}</p>
    </article>
  </div>
</template>

<style scoped>
.placeholder-page {
  height: 100%;
  overflow-y: auto;
  padding: 28px;
  box-sizing: border-box;
  background: var(--uc-app-bg);
}
.card {
  max-width: 680px;
  margin: 0 auto;
  background: var(--uc-panel-bg);
  border: 1px solid var(--uc-border);
  border-left: 3px solid var(--uc-primary);
  border-radius: 4px;
  padding: 22px 24px;
  display: grid;
  gap: 10px;
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--uc-ink-strong);
}
.badge {
  padding: 2px 8px;
  border-radius: 3px;
  background: var(--uc-primary-soft);
  color: var(--uc-primary);
  font-size: 11px;
  font-weight: 700;
}
.desc {
  margin: 0;
  color: var(--uc-ink-muted);
  font-size: 13px;
  line-height: 1.55;
}
</style>
