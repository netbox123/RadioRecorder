<template>
  <div class="page">
    <h1 class="page-heading">Settings</h1>

    <div class="card">
      <div class="card-title">Recording</div>

      <div class="fields">
        <div class="field">
          <label class="field-label">Download Directory</label>
          <input
            v-model="form.download_dir"
            class="input"
            placeholder="/path/to/recordings"
            spellcheck="false"
          />
          <div class="field-hint">Full path where recorded MP3 files will be saved.</div>
        </div>

        <div class="field">
          <label class="field-label">Last.fm API Key</label>
          <input
            v-model="form.lastfm_key"
            class="input"
            placeholder="Leave blank to use station logo"
            spellcheck="false"
            autocomplete="off"
          />
          <div class="field-hint">
            Last.fm key is used to fetch album artwork for recorded songs. If not set, the station logo is used instead.
            Get a free key at <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener" class="link">last.fm/api</a>.
          </div>
        </div>

        <div class="field field--row">
          <label class="field-label">Listen while recording</label>
          <button
            class="toggle"
            :class="{ 'toggle--on': form.listen_while_recording }"
            @click="form.listen_while_recording = !form.listen_while_recording"
            type="button"
          >
            <span class="toggle-knob"></span>
          </button>
          <div class="field-hint">Play the stream in the browser while recording.</div>
        </div>
      </div>

      <div class="save-row">
        <button class="btn btn-blue" @click="saveSettings" :disabled="saving">
          {{ saving ? 'Saving…' : 'Save Settings' }}
        </button>
        <Transition name="fade">
          <span v-if="saved" class="saved-msg">Settings saved.</span>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const form = ref({ download_dir: '', lastfm_key: '', listen_while_recording: false });
const saving = ref(false);
const saved = ref(false);

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    form.value = { download_dir: data.download_dir || '', lastfm_key: data.lastfm_key || '', listen_while_recording: data.listen_while_recording ?? false };
  } catch (_) {}
}

async function saveSettings() {
  saving.value = true;
  try {
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form.value),
    });
    saved.value = true;
    setTimeout(() => { saved.value = false; }, 2500);
  } catch (_) {}
  saving.value = false;
}

onMounted(fetchSettings);
</script>

<style scoped>
.page {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
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

.card-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 1rem;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.field-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
}

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

.field-hint {
  font-size: 0.78rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.link {
  color: var(--accent-blue);
  text-decoration: none;
}
.link:hover { text-decoration: underline; }

.save-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
}

.btn {
  display: inline-flex;
  align-items: center;
  padding: 0.45rem 1rem;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: filter 0.15s;
}

.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn:not(:disabled):hover { filter: brightness(1.12); }
.btn-blue { background: var(--accent-blue); color: #fff; }

.saved-msg {
  font-size: 0.85rem;
  color: var(--accent-green);
  font-weight: 500;
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.4s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

.field--row {
  flex-direction: row;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.field--row .field-label { white-space: nowrap; }
.field--row .field-hint { flex-basis: 100%; margin-top: -0.25rem; }

.toggle {
  width: 40px;
  height: 22px;
  border-radius: 11px;
  border: none;
  background: var(--border);
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  transition: background 0.2s;
  padding: 0;
}
.toggle--on { background: var(--accent-blue); }
.toggle-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  transition: left 0.2s;
}
.toggle--on .toggle-knob { left: 21px; }
</style>
