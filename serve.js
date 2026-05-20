import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import recorder from './recorder.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const CONFIG_DIR = path.join(__dirname, 'config');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const STATIONS_FILE = path.join(CONFIG_DIR, 'stations.json');

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ---------- Settings ----------
app.get('/api/settings', (_req, res) => {
  const settings = readJSON(SETTINGS_FILE) || {};
  res.json(settings);
});

app.post('/api/settings', (req, res) => {
  writeJSON(SETTINGS_FILE, req.body);
  res.json({ ok: true });
});

// ---------- Stations ----------
app.get('/api/stations', (_req, res) => {
  res.json(readJSON(STATIONS_FILE) || []);
});

app.post('/api/stations', (req, res) => {
  const stations = readJSON(STATIONS_FILE) || [];
  const incoming = req.body;
  const id = incoming.id || Date.now().toString();
  const station = { ...incoming, id };
  const idx = stations.findIndex((s) => s.id === id);
  if (idx >= 0) {
    stations[idx] = station;
  } else {
    stations.push(station);
  }
  writeJSON(STATIONS_FILE, stations);
  res.json(station);
});

app.delete('/api/stations/:id', (req, res) => {
  const stations = readJSON(STATIONS_FILE) || [];
  const filtered = stations.filter((s) => s.id !== req.params.id);
  writeJSON(STATIONS_FILE, filtered);
  res.json({ ok: true });
});

// ---------- Record ----------
app.get('/api/record/status', (_req, res) => {
  res.json(recorder.getStatus());
});

app.post('/api/record/start', (req, res) => {
  const { stationId } = req.body;
  const stations = readJSON(STATIONS_FILE) || [];
  const station = stations.find((s) => s.id === stationId);
  if (!station) {
    return res.status(404).json({ error: 'Station not found' });
  }
  const settings = readJSON(SETTINGS_FILE) || {};
  recorder.start(station, settings);
  res.json({ ok: true });
});

app.post('/api/record/stop', (_req, res) => {
  recorder.stop();
  res.json({ ok: true });
});

// ---------- Recordings list ----------
app.get('/api/recordings', (_req, res) => {
  const settings = readJSON(SETTINGS_FILE) || {};
  const downloadDir = settings.download_dir;
  if (!downloadDir) return res.json([]);

  const results = [];
  try {
    if (!fs.existsSync(downloadDir)) return res.json([]);
    const stationDirs = fs.readdirSync(downloadDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    for (const stationDir of stationDirs) {
      const stationPath = path.join(downloadDir, stationDir);
      let files;
      try {
        files = fs.readdirSync(stationPath, { withFileTypes: true });
      } catch (_) { continue; }

      for (const f of files) {
        if (!f.isFile() || !f.name.endsWith('.mp3') || f.name.startsWith('._')) continue;
        const filePath = path.join(stationPath, f.name);
        let stat;
        try { stat = fs.statSync(filePath); } catch (_) { continue; }
        results.push({
          name: f.name.replace(/\.mp3$/, ''),
          station: stationDir,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          url: `/recordings/${encodeURIComponent(stationDir)}/${encodeURIComponent(f.name)}`,
        });
      }
    }
  } catch (e) {
    console.error('[serve] recordings scan error:', e.message);
    return res.json([]);
  }

  results.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
  res.json(results.slice(0, 100));
});

// ---------- Static recordings ----------
// Dynamic middleware so download_dir changes are respected
app.use('/recordings', (req, res, next) => {
  const settings = readJSON(SETTINGS_FILE) || {};
  const downloadDir = settings.download_dir;
  if (!downloadDir) return res.status(404).send('Not found');
  express.static(downloadDir)(req, res, next);
});

// ---------- Vue app ----------
const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir));
app.get('*', (_req, res) => {
  const indexFile = path.join(distDir, 'index.html');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(404).send('Build the frontend first: npm run build');
  }
});

// ---------- HTTP + WS ----------
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

recorder.onStatus = (status) => {
  broadcast({ type: 'status', ...status });
};

wss.on('connection', (ws) => {
  const status = recorder.getStatus();
  ws.send(JSON.stringify({ type: 'status', ...status }));
});

server.listen(3003, () => {
  console.log('[RadioRecord] Server running on http://localhost:3003');
});
