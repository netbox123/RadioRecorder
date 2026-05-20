<template>
  <div class="app-layout">
    <Sidebar :activePage="page" @navigate="page = $event" />
    <main class="app-main">
      <MainPage v-if="page === 'main'" />
      <StationsPage v-if="page === 'stations'" />
      <SettingsPage v-if="page === 'settings'" />
    </main>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import Sidebar from './components/Sidebar.vue';
import MainPage from './views/MainPage.vue';
import StationsPage from './views/StationsPage.vue';
import SettingsPage from './views/SettingsPage.vue';

const page = ref('main');
</script>
