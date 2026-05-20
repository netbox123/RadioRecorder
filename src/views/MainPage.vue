<template>
  <div class="page">
    <!-- Recording control card -->
    <div class="card">
      <div class="card-title">Recording Control</div>

      <div class="control-row">
        <select v-model="selectedStationId" class="select" :disabled="status.recording" @change="localStorage.setItem('rr_station', selectedStationId)">
          <option value="" disabled>Select a station…</option>
          <option v-for="s in stations" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>

        <button
          class="btn record-btn"
          :class="status.recording ? 'btn-red' : 'btn-green'"
          :disabled="!selectedStationId && !status.recording"
          @click="toggleRecording"
        >
          <span v-if="status.recording" class="pulse-dot"></span>
          {{ status.recording ? 'Stop Recording' : 'Start Recording' }}
        </button>
      </div>

      <div v-if="status.recording" class="status-row">
        <div class="status-item">
          <span class="status-label">Station</span>
          <span class="status-value">{{ status.stationName }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Elapsed</span>
          <span class="status-value mono">{{ elapsed }}</span>
        </div>
        <div class="status-item">
          <span class="status-label">Files Recorded</span>
          <span class="status-value">{{ status.filesRecorded }}</span>
        </div>
        <div v-if="status.bitrate" class="status-item">
          <span class="status-label">Bitrate</span>
          <span class="status-value mono">{{ status.bitrate }}</span>
        </div>
      </div>
    </div>

    <!-- Listen player -->
    <div v-if="status.recording && settings.listen_while_recording && activeStreamUrl" class="card listen-card">
      <div class="card-title">Live Stream</div>
      <audio :src="activeStreamUrl" controls autoplay class="audio-player"></audio>
    </div>

    <!-- Now playing card -->
    <div v-if="status.recording" class="card now-playing-card">
      <div class="card-title">Now Playing</div>
      <div v-if="status.track" class="now-playing">
        <img v-if="status.artUrl" :src="status.artUrl" class="now-playing-art" />
        <div class="now-playing-text">
          <div class="track-artist">{{ status.track.artist || 'Unknown Artist' }}</div>
          <div class="track-title">{{ status.track.title || status.track.streamTitle }}</div>
        </div>
      </div>
      <div v-else class="waiting">Waiting for track info…</div>
    </div>

    <!-- Recordings list card -->
    <div class="card">
      <div class="card-title-row">
        <div class="card-title">Recordings</div>
        <button class="btn btn-sm btn-outline" @click="fetchRecordings">Refresh</button>
      </div>

      <div v-if="recordings.length === 0" class="empty-state">No recordings yet.</div>

      <div v-else class="recordings-list">
        <div
          v-for="rec in recordings"
          :key="rec.url"
          class="recording-row"
          :class="{ playing: playingUrl === rec.url }"
        >
          <div class="rec-info" @click="togglePlay(rec)">
            <button class="play-btn" :title="playingUrl === rec.url ? 'Collapse' : 'Play'">
              <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                <path v-if="playingUrl === rec.url" :d="mdiChevronUp" />
                <path v-else :d="mdiPlay" />
              </svg>
            </button>
            <div class="rec-details">
              <div class="rec-name">{{ rec.name }}</div>
              <div class="rec-meta">{{ rec.station }} &middot; {{ formatSize(rec.size) }} &middot; {{ formatDate(rec.mtime) }}</div>
            </div>
            <a
              class="btn btn-sm btn-outline download-btn"
              :href="rec.url"
              :download="rec.name + '.mp3'"
              @click.stop
            >Download</a>
          </div>

          <div v-if="playingUrl === rec.url" class="audio-wrapper">
            <audio :src="rec.url" controls autoplay class="audio-player"></audio>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue';
import { mdiPlay, mdiChevronUp } from '@mdi/js';

const stations = ref([]);
const selectedStationId = ref(localStorage.getItem('rr_station') || '');
const recordings = ref([]);
const playingUrl = ref(null);
const settings = ref({ listen_while_recording: false });

const activeStreamUrl = computed(() => {
  const id = status.value.stationId;
  if (!id) return null;
  return stations.value.find(s => s.id === id)?.stream_url ?? null;
});

const status = ref({
  recording: false,
  stationName: null,
  track: null,
  startTime: null,
  filesRecorded: 0,
});

let ws = null;
let elapsedTimer = null;
const elapsedSec = ref(0);

const elapsed = computed(() => {
  const s = elapsedSec.value;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
});

function startElapsedTimer() {
  stopElapsedTimer();
  elapsedSec.value = status.value.startTime
    ? Math.floor((Date.now() - status.value.startTime) / 1000)
    : 0;
  elapsedTimer = setInterval(() => {
    elapsedSec.value = status.value.startTime
      ? Math.floor((Date.now() - status.value.startTime) / 1000)
      : 0;
  }, 1000);
}

function stopElapsedTimer() {
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
  elapsedSec.value = 0;
}

function applyStatus(s) {
  const wasRecording = status.value.recording;
  const prevFiles = status.value.filesRecorded;
  status.value = s;
  if (s.recording && !wasRecording) {
    startElapsedTimer();
  } else if (!s.recording && wasRecording) {
    stopElapsedTimer();
    fetchRecordings();
  }
  if (s.filesRecorded > prevFiles) {
    fetchRecordings();
  }
}

function connectWS() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'status') applyStatus(msg);
    } catch (_) {}
  };
  ws.onclose = () => setTimeout(connectWS, 3000);
  ws.onerror = () => ws.close();
}

async function fetchStations() {
  try {
    const res = await fetch('/api/stations');
    stations.value = await res.json();
  } catch (_) {}
}

async function fetchSettings() {
  try {
    const res = await fetch('/api/settings');
    settings.value = await res.json();
  } catch (_) {}
}

async function fetchRecordings() {
  try {
    const res = await fetch('/api/recordings');
    recordings.value = await res.json();
  } catch (_) {}
}

async function toggleRecording() {
  if (status.value.recording) {
    await fetch('/api/record/stop', { method: 'POST' });
  } else {
    if (!selectedStationId.value) return;
    localStorage.setItem('rr_station', selectedStationId.value);
    await fetch('/api/record/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stationId: selectedStationId.value }),
    });
  }
}

function togglePlay(rec) {
  if (playingUrl.value === rec.url) {
    playingUrl.value = null;
  } else {
    playingUrl.value = rec.url;
  }
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

onMounted(() => {
  fetchStations();
  fetchSettings();
  fetchRecordings();
  connectWS();
  // Get initial status
  fetch('/api/record/status').then((r) => r.json()).then((s) => applyStatus(s)).catch(() => {});
});

onUnmounted(() => {
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  stopElapsedTimer();
});
</script>

<style scoped>
.page {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
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

.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.card-title-row .card-title {
  margin-bottom: 0;
}

.control-row {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  flex-wrap: wrap;
}

.select {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-primary);
  padding: 0.4rem 0.6rem;
  font-family: inherit;
  font-size: 0.875rem;
  flex: 1;
  min-width: 180px;
}

.select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

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
  text-decoration: none;
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn:not(:disabled):hover {
  filter: brightness(1.12);
}

.btn-blue  { background: var(--accent-blue); color: #fff; }
.btn-red   { background: var(--accent-red);  color: #fff; }
.btn-green { background: var(--accent-green); color: #fff; }
.btn-outline {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
}
.btn-outline:hover { background: var(--bg-card-hover); color: var(--text-primary); }

.btn-sm {
  padding: 0.3rem 0.65rem;
  font-size: 0.8rem;
}

.record-btn {
  padding: 0.45rem 1.25rem;
}

.pulse-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
  animation: pulse 1.2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.status-row {
  display: flex;
  gap: 2rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}

.status-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.status-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.status-value {
  font-size: 0.9rem;
  color: var(--text-primary);
  font-weight: 500;
}

.mono { font-family: 'SF Mono', 'Fira Code', monospace; }

.listen-card { background: var(--bg-surface); }

.now-playing-card {
  background: var(--bg-card-hover);
}

.now-playing {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.now-playing-art {
  width: 80px;
  height: 80px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--border);
}

.now-playing-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.track-artist {
  font-size: 1rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.track-title {
  font-size: 1.4rem;
  color: var(--text-primary);
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.waiting {
  color: var(--text-muted);
  font-style: italic;
}

.empty-state {
  color: var(--text-muted);
  text-align: center;
  padding: 2rem 0;
}

.recordings-list {
  display: flex;
  flex-direction: column;
  max-height: 480px;
  overflow-y: auto;
}

.recording-row {
  border-bottom: 1px solid var(--border);
}

.recording-row:last-child {
  border-bottom: none;
}

.rec-info {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.25rem;
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.12s;
}

.rec-info:hover {
  background: var(--bg-card-hover);
}

.play-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 50%;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
}

.play-btn:hover {
  background: var(--accent-blue);
  color: #fff;
  border-color: var(--accent-blue);
}

.rec-details {
  flex: 1;
  min-width: 0;
}

.rec-name {
  font-size: 0.875rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rec-meta {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.15rem;
}

.download-btn {
  flex-shrink: 0;
}

.audio-wrapper {
  padding: 0.5rem 0.25rem 0.75rem;
}

.audio-player {
  width: 100%;
  height: 36px;
}
</style>
