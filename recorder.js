import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const NodeID3 = require('node-id3');

function sanitizeName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim();
}

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { headers: { 'User-Agent': 'RadioRecord/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchUrl(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout fetching ' + url)); });
  });
}

class Recorder {
  constructor() {
    this._status = {
      recording: false,
      stationId: null,
      stationName: null,
      track: null,
      startTime: null,
      filesRecorded: 0,
    };
    this._station = null;
    this._settings = null;
    this._req = null;
    this._writeStream = null;
    this._currentFilePath = null;
    this._currentTrack = null;
    this._reconnectTimer = null;
    this._shouldRecord = false;
    this.onStatus = null;
  }

  getStatus() {
    return { ...this._status };
  }

  _emitStatus() {
    if (typeof this.onStatus === 'function') {
      this.onStatus(this.getStatus());
    }
  }

  _setTrack(streamTitle) {
    let artist = '';
    let title = streamTitle;
    if (streamTitle.includes(' - ')) {
      const idx = streamTitle.indexOf(' - ');
      artist = streamTitle.slice(0, idx).trim();
      title = streamTitle.slice(idx + 3).trim();
    }
    return { artist, title, streamTitle };
  }

  start(station, settings) {
    if (this._status.recording) return;
    this._station = station;
    this._settings = settings;
    this._shouldRecord = true;
    this._isFirstTrack = true;
    this._status = {
      recording: true,
      stationId: station.id,
      stationName: station.name,
      track: null,
      startTime: Date.now(),
      filesRecorded: 0,
    };
    this._emitStatus();
    this._connect();
  }

  stop() {
    this._shouldRecord = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._req) {
      try { this._req.destroy(); } catch (_) {}
      this._req = null;
    }
    const lastFile = this._currentFilePath;
    this._closeCurrentFile();
    if (lastFile) {
      try { fs.unlinkSync(lastFile); console.log('[Recorder] Deleted last partial track:', path.basename(lastFile)); } catch (_) {}
    }
    this._status = {
      recording: false,
      stationId: null,
      stationName: null,
      track: null,
      startTime: null,
      filesRecorded: this._status.filesRecorded,
      bitrate: null,
      artUrl: null,
    };
    this._emitStatus();
  }

  _connect() {
    if (!this._shouldRecord) return;

    const station = this._station;
    const streamUrl = station.stream_url;
    const isHttps = streamUrl.startsWith('https');
    const mod = isHttps ? https : http;

    let urlObj;
    try {
      urlObj = new URL(streamUrl);
    } catch (e) {
      console.error('[Recorder] Invalid stream URL:', streamUrl);
      this._scheduleReconnect();
      return;
    }

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      headers: {
        'Icy-MetaData': '1',
        'User-Agent': 'RadioRecord/1.0',
        'Connection': 'keep-alive',
      },
    };

    console.log(`[Recorder] Connecting to ${streamUrl}`);

    const req = mod.get(options, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        req.destroy();
        this._station = { ...station, stream_url: res.headers.location };
        this._connect();
        return;
      }

      if (res.statusCode !== 200) {
        console.error(`[Recorder] HTTP ${res.statusCode}`);
        res.resume();
        this._scheduleReconnect();
        return;
      }

      const icyMetaint = parseInt(res.headers['icy-metaint'] || '0', 10);
      const icyBr = res.headers['icy-br'] || null;
      if (icyBr) { this._status.bitrate = icyBr + ' kbps'; this._emitStatus(); }
      console.log(`[Recorder] Connected. icy-metaint=${icyMetaint} icy-br=${icyBr}`);

      // ICY state machine
      let state = 'audio'; // 'audio' | 'metalength' | 'meta'
      let audioRemaining = icyMetaint > 0 ? icyMetaint : Infinity;
      let metaLength = 0;
      let metaRemaining = 0;
      let metaChunks = [];

      res.on('data', (chunk) => {
        let offset = 0;
        while (offset < chunk.length) {
          if (state === 'audio') {
            if (icyMetaint === 0) {
              // No metadata, write everything as audio
              this._writeAudio(chunk.slice(offset));
              offset = chunk.length;
            } else {
              const available = chunk.length - offset;
              const take = Math.min(audioRemaining, available);
              this._writeAudio(chunk.slice(offset, offset + take));
              offset += take;
              audioRemaining -= take;
              if (audioRemaining === 0) {
                state = 'metalength';
                audioRemaining = icyMetaint;
              }
            }
          } else if (state === 'metalength') {
            metaLength = chunk[offset] * 16;
            offset++;
            if (metaLength === 0) {
              state = 'audio';
            } else {
              metaRemaining = metaLength;
              metaChunks = [];
              state = 'meta';
            }
          } else if (state === 'meta') {
            const available = chunk.length - offset;
            const take = Math.min(metaRemaining, available);
            metaChunks.push(chunk.slice(offset, offset + take));
            offset += take;
            metaRemaining -= take;
            if (metaRemaining === 0) {
              const metaBuf = Buffer.concat(metaChunks);
              const metaStr = metaBuf.toString('utf8').replace(/\0+$/, '');
              this._handleMeta(metaStr);
              metaChunks = [];
              state = 'audio';
            }
          }
        }
      });

      res.on('end', () => {
        console.log('[Recorder] Stream ended');
        this._closeCurrentFile();
        this._scheduleReconnect();
      });

      res.on('error', (err) => {
        console.error('[Recorder] Stream error:', err.message);
        this._closeCurrentFile();
        this._scheduleReconnect();
      });
    });

    req.on('error', (err) => {
      console.error('[Recorder] Request error:', err.message);
      this._scheduleReconnect();
    });

    req.setTimeout(30000, () => {
      console.error('[Recorder] Request timeout');
      req.destroy();
      this._scheduleReconnect();
    });

    this._req = req;
  }

  _scheduleReconnect() {
    if (!this._shouldRecord) return;
    console.log('[Recorder] Reconnecting in 3s...');
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this._shouldRecord) this._connect();
    }, 3000);
  }

  _writeAudio(buf) {
    if (!buf || buf.length === 0) return;
    if (this._writeStream) {
      try { this._writeStream.write(buf); } catch (_) {}
    }
  }

  _handleMeta(metaStr) {
    // Parse StreamTitle='...';
    const match = metaStr.match(/StreamTitle='([^']*)'/);
    const streamTitle = match ? match[1].trim() : '';

    if (!streamTitle) return;

    const currentStreamTitle = this._currentTrack ? this._currentTrack.streamTitle : null;
    if (streamTitle === currentStreamTitle) return; // no change

    console.log(`[Recorder] Track change: "${streamTitle}"`);

    // Close previous file
    const oldFilePath = this._currentFilePath;
    const oldTrack = this._currentTrack;
    this._closeCurrentFile();

    // Tag the old file async
    if (oldFilePath && oldTrack) {
      this._tagFile(oldFilePath, oldTrack).catch((e) =>
        console.error('[Recorder] Tag error:', e.message)
      );
    }

    // Start new file
    const track = this._setTrack(streamTitle);
    this._currentTrack = track;

    // Fetch artwork URL for Now Playing display
    this._status.artUrl = this._station.logo_url || null;
    this._emitStatus();
    this._fetchArtUrl(track).then(url => {
      if (url && this._currentTrack?.streamTitle === streamTitle) {
        this._status.artUrl = url;
        this._emitStatus();
      }
    }).catch(() => {});

    // Skip the first partial song (recording started mid-song)
    if (this._isFirstTrack) {
      this._isFirstTrack = false;
      this._currentFilePath = null;
      this._writeStream = null;
      console.log(`[Recorder] Skipping first partial track: "${streamTitle}"`);
      return;
    }

    const downloadDir = this._settings.download_dir;
    const stationDir = sanitizeName(this._station.name);
    const fileName = sanitizeName(streamTitle) + '.mp3';
    const dir = path.join(downloadDir, stationDir);

    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.error('[Recorder] mkdir error:', e.message);
      return;
    }

    const filePath = path.join(dir, fileName);

    if (fs.existsSync(filePath)) {
      console.log(`[Recorder] Skipping (already exists): ${fileName}`);
      this._currentFilePath = null;
      this._writeStream = null;
    } else {
      this._currentFilePath = filePath;
      try {
        this._writeStream = fs.createWriteStream(filePath);
        this._writeStream.on('error', (e) => console.error('[Recorder] WriteStream error:', e.message));
        console.log(`[Recorder] Recording to: ${filePath}`);
      } catch (e) {
        console.error('[Recorder] Failed to open write stream:', e.message);
        this._writeStream = null;
        this._currentFilePath = null;
      }
    }

    this._status.track = track;
    this._emitStatus();
  }

  _closeCurrentFile() {
    if (this._writeStream) {
      try { this._writeStream.end(); } catch (_) {}
      this._writeStream = null;
    }
    this._currentFilePath = null;
  }

  async _tagFile(filePath, track) {
    // Wait a moment for the file to be fully written
    await new Promise((r) => setTimeout(r, 500));

    let size = 0;
    try {
      size = fs.statSync(filePath).size;
    } catch (_) {
      return;
    }

    if (size < 4096) {
      console.log(`[Recorder] Deleting small file (${size} bytes): ${filePath}`);
      try { fs.unlinkSync(filePath); } catch (_) {}
      return;
    }

    const imageBuffer = await this._fetchArtwork(track);

    const tags = {
      title: track.title || track.streamTitle,
      artist: track.artist || '',
      album: this._station ? this._station.name : '',
    };

    if (imageBuffer) {
      tags.image = {
        mime: 'image/jpeg',
        type: { id: 3 },
        description: 'Cover',
        imageBuffer,
      };
    }

    const success = NodeID3.write(tags, filePath);
    if (success === true || success === filePath) {
      console.log(`[Recorder] Tagged: ${path.basename(filePath)}`);
      this._status.filesRecorded = (this._status.filesRecorded || 0) + 1;
      this._emitStatus();
    } else {
      console.error(`[Recorder] ID3 write failed for: ${filePath}`);
    }
  }

  async _fetchArtUrl(track) {
    const settings = this._settings;
    if (settings.lastfm_key && track.artist && track.title) {
      try {
        const url = `https://ws.audioscrobbler.com/2.0/?method=track.getInfo` +
          `&api_key=${encodeURIComponent(settings.lastfm_key)}` +
          `&artist=${encodeURIComponent(track.artist)}` +
          `&track=${encodeURIComponent(track.title)}` +
          `&format=json`;
        const body = await fetchUrl(url);
        const data = JSON.parse(body.toString('utf8'));
        const images = data?.track?.album?.image;
        if (images) {
          const xl = images.find(i => i.size === 'extralarge' && i['#text']);
          if (xl?.['#text']) return xl['#text'];
        }
      } catch { /* fall through */ }
    }
    return this._station?.logo_url || null;
  }

  async _fetchArtwork(track) {
    const settings = this._settings;

    // Try Last.fm
    if (settings.lastfm_key && track.artist && track.title) {
      try {
        const lfmUrl =
          `https://ws.audioscrobbler.com/2.0/?method=track.getInfo` +
          `&api_key=${encodeURIComponent(settings.lastfm_key)}` +
          `&artist=${encodeURIComponent(track.artist)}` +
          `&track=${encodeURIComponent(track.title)}` +
          `&format=json`;
        const body = await fetchUrl(lfmUrl);
        const data = JSON.parse(body.toString('utf8'));
        const images = data && data.track && data.track.album && data.track.album.image;
        if (images && Array.isArray(images)) {
          const xl = images.find((i) => i.size === 'extralarge' && i['#text']);
          if (xl && xl['#text']) {
            const imgBuf = await fetchUrl(xl['#text']);
            return imgBuf;
          }
        }
      } catch (e) {
        console.warn('[Recorder] Last.fm artwork fetch failed:', e.message);
      }
    }

    // Fallback: station logo
    if (this._station && this._station.logo_url) {
      try {
        const logoBuf = await fetchUrl(this._station.logo_url);
        return logoBuf;
      } catch (e) {
        console.warn('[Recorder] Logo fetch failed:', e.message);
      }
    }

    return null;
  }
}

export default new Recorder();
