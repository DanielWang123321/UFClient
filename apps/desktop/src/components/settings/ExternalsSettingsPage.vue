<script setup lang="ts">
// Placeholder sub-page for Externals (end-effector I/O, grippers, FT sensors, linear track).
</script>

<template>
  <div class="subpage" data-test="settings-page-externals">
    <article class="card">
      <div class="head">
        <h2>{{ $t('settings.externals.title') }}</h2>
        <span class="badge">{{ $t('settings.placeholderBadge') }}</span>
      </div>
      <p class="desc">{{ $t('settings.externals.desc') }}</p>
    </article>
  </div>
</template>

<style scoped>
.subpage {
  display: grid;
  gap: 14px;
}
.card {
  background: var(--uc-panel-bg);
  border: 1px solid var(--uc-border);
  border-radius: 4px;
  padding: 20px 22px;
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
  font-size: 15px;
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
