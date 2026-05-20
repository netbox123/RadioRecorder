<template>
  <div class="page">
    <div class="page-header">
      <h1 class="page-heading">Radio Stations</h1>
      <button class="btn btn-blue" @click="openAdd">+ Add Station</button>
    </div>

    <div v-if="stations.length === 0" class="card empty-state">
      No stations configured. Click "Add Station" to get started.
    </div>

    <div class="stations-grid">
      <div v-for="s in stations" :key="s.id" class="station-card">
        <div class="station-logo-wrap">
          <img
            v-if="s.logo_url"
            :src="s.logo_url"
            :alt="s.name"
            class="station-logo"
            @error="(e) => e.target.style.display = 'none'"
          />
          <div v-else class="station-logo-placeholder">
            <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
              <path :d="mdiRadioTower" />
            </svg>
          </div>
        </div>

        <div class="station-info">
          <div class="station-name">{{ s.name }}</div>
          <div class="station-url">{{ s.stream_url }}</div>
        </div>

        <div class="station-actions">
          <button class="btn btn-sm btn-outline" @click="openEdit(s)">Edit</button>
          <button class="btn btn-sm btn-danger" @click="deleteStation(s)">Delete</button>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <div v-if="modalOpen" class="modal-overlay" @click.self="closeModal">
      <div class="modal">
        <div class="modal-header">
          <span>{{ editId ? 'Edit Station' : 'Add Station' }}</span>
          <button class="modal-close" @click="closeModal">✕</button>
        </div>

        <div class="modal-body">
          <div class="field">
            <label class="field-label">Name</label>
            <input v-model="form.name" class="input" placeholder="SomaFM Groove Salad" />
          </div>
          <div class="field">
            <label class="field-label">Stream URL</label>
            <input v-model="form.stream_url" class="input" placeholder="http://ice1.somafm.com/..." />
          </div>
          <div class="field">
            <label class="field-label">Logo URL <span class="optional">(optional)</span></label>
            <input v-model="form.logo_url" class="input" placeholder="https://..." />
          </div>
          <div v-if="form.logo_url" class="logo-preview">
            <img :src="form.logo_url" alt="Preview" class="logo-preview-img" @error="(e) => e.target.style.display='none'" />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-outline" @click="closeModal">Cancel</button>
          <button class="btn btn-blue" @click="saveStation" :disabled="!form.name || !form.stream_url">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { mdiRadioTower } from '@mdi/js';

const stations = ref([]);
const modalOpen = ref(false);
const editId = ref(null);
const form = ref({ name: '', stream_url: '', logo_url: '' });

async function fetchStations() {
  try {
    const res = await fetch('/api/stations');
    stations.value = await res.json();
  } catch (_) {}
}

function openAdd() {
  editId.value = null;
  form.value = { name: '', stream_url: '', logo_url: '' };
  modalOpen.value = true;
}

function openEdit(station) {
  editId.value = station.id;
  form.value = { name: station.name, stream_url: station.stream_url, logo_url: station.logo_url || '' };
  modalOpen.value = true;
}

function closeModal() {
  modalOpen.value = false;
}

async function saveStation() {
  const payload = {
    id: editId.value || undefined,
    name: form.value.name,
    stream_url: form.value.stream_url,
    logo_url: form.value.logo_url,
  };
  try {
    await fetch('/api/stations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    closeModal();
    await fetchStations();
  } catch (_) {}
}

async function deleteStation(station) {
  if (!confirm(`Delete station "${station.name}"?`)) return;
  try {
    await fetch(`/api/stations/${station.id}`, { method: 'DELETE' });
    await fetchStations();
  } catch (_) {}
}

onMounted(fetchStations);
</script>

<style scoped>
.page {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-heading {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1.25rem;
}

.empty-state {
  color: var(--text-muted);
  text-align: center;
  padding: 2.5rem;
}

.stations-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.station-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  display: flex;
  align-items: center;
  gap: 1rem;
  transition: background 0.15s;
}

.station-card:hover {
  background: var(--bg-card-hover);
}

.station-logo-wrap {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: 6px;
  overflow: hidden;
  background: var(--bg-surface);
  display: flex;
  align-items: center;
  justify-content: center;
}

.station-logo {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.station-logo-placeholder {
  color: var(--text-muted);
}

.station-info {
  flex: 1;
  min-width: 0;
}

.station-name {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.station-url {
  font-size: 0.78rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.station-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s, filter 0.15s;
  white-space: nowrap;
}

.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn:not(:disabled):hover { filter: brightness(1.12); }

.btn-blue    { background: var(--accent-blue); color: #fff; }
.btn-danger  { background: var(--accent-red);  color: #fff; }
.btn-outline {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
.btn-outline:hover { background: var(--bg-card-hover); color: var(--text-primary); filter: none; }
.btn-sm { padding: 0.3rem 0.65rem; font-size: 0.8rem; }

/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  width: 460px;
  max-width: 95vw;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  color: var(--text-primary);
}

.modal-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1rem;
  cursor: pointer;
  padding: 0.2rem;
  border-radius: 4px;
}
.modal-close:hover { color: var(--text-primary); background: var(--bg-card-hover); }

.modal-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.field { display: flex; flex-direction: column; gap: 0.35rem; }

.field-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.optional { color: var(--text-muted); font-weight: 400; }

.input {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-primary);
  padding: 0.4rem 0.6rem;
  font-family: inherit;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
}
.input:focus { border-color: var(--accent-blue); }
.input::placeholder { color: var(--text-muted); }

.logo-preview { display: flex; justify-content: center; }
.logo-preview-img {
  max-width: 80px;
  max-height: 80px;
  border-radius: 6px;
  border: 1px solid var(--border);
  object-fit: cover;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border);
}
</style>
