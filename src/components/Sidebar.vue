<template>
  <aside class="sidebar">
    <div class="sidebar-logo">
      <svg class="logo-icon" viewBox="0 0 24 24" fill="currentColor">
        <path :d="mdiRadio" />
      </svg>
      <span class="logo-text">Radio Recorder</span>
    </div>

    <nav class="sidebar-nav">
      <button
        v-for="item in navItems"
        :key="item.slug"
        class="nav-item"
        :class="{ active: activePage === item.slug }"
        @click="$emit('navigate', item.slug)"
      >
        <svg class="nav-icon" viewBox="0 0 24 24" fill="currentColor">
          <path :d="item.icon" />
        </svg>
        <span>{{ item.label }}</span>
      </button>
    </nav>
  </aside>
</template>

<script setup>
import { mdiHome, mdiRadioTower, mdiCog, mdiRadio } from '@mdi/js';

defineProps({ activePage: String });
defineEmits(['navigate']);

const navItems = [
  { slug: 'main',     label: 'Main',            icon: mdiHome },
  { slug: 'stations', label: 'Radio Stations',   icon: mdiRadioTower },
  { slug: 'settings', label: 'Settings',         icon: mdiCog },
];
</script>

<style scoped>
.sidebar {
  width: 200px;
  min-width: 200px;
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 1.1rem 1rem;
  border-bottom: 1px solid var(--border);
  color: var(--text-primary);
}

.logo-icon {
  width: 20px;
  height: 20px;
  color: var(--accent-blue);
  flex-shrink: 0;
}

.logo-text {
  font-size: 0.85rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0;
  flex: 1;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
  color: var(--text-secondary);
  background: none;
  border: none;
  border-left: 3px solid transparent;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.nav-item:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--bg-card);
  color: var(--text-primary);
  border-left-color: var(--accent-blue);
}

.nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
</style>
