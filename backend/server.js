const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const os = require('os');
const http = require('http');
const { v4: uuidV4 } = require('uuid');
const { ExpressPeerServer } = require('peer');

const app = express();
const server = http.createServer(app);
const roomMembers = new Map();

app.use(express.json());

function touchRoomMember(roomId, peerId) {
  if (!roomMembers.has(roomId)) {
    roomMembers.set(roomId, new Map());
  }
  const room = roomMembers.get(roomId);
  room.set(peerId, Date.now());
}

function cleanupRoom(roomId) {
  const room = roomMembers.get(roomId);
  if (!room || room.size === 0) {
    roomMembers.delete(roomId);
  }
}

function getNgrokPublicUrl() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const tunnels = Array.isArray(parsed.tunnels) ? parsed.tunnels : [];
          const httpsTunnel = tunnels.find((t) => t.public_url && t.public_url.startsWith('https://'));
          const httpTunnel = tunnels.find((t) => t.public_url && t.public_url.startsWith('http://'));
          resolve((httpsTunnel || httpTunnel || {}).public_url || null);
        } catch (error) {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.setTimeout(1200, () => {
      req.destroy();
      resolve(null);
    });
  });
}

// PeerJS server
const peerServer = ExpressPeerServer(server, { debug: true, path: '/' });
app.use('/peerjs', peerServer);

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Serve assets
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));

// API: create room
app.get('/api/room/create', (req, res) => {
  const roomId = uuidV4().slice(0, 8);
  res.json({ roomId });
});

// API: register a peer in a room and return existing peers
app.post('/api/room/join', (req, res) => {
  const roomId = String((req.body && req.body.roomId) || '').trim();
  const peerId = String((req.body && req.body.peerId) || '').trim();

  if (!roomId || !peerId) {
    return res.status(400).json({ error: 'roomId and peerId are required' });
  }

  touchRoomMember(roomId, peerId);
  const peers = Array.from(roomMembers.get(roomId).keys()).filter((id) => id !== peerId);
  return res.json({ peers });
});

// API: list peers currently in a room
app.get('/api/room/peers', (req, res) => {
  const roomId = String(req.query.room || '').trim();
  const selfPeerId = String(req.query.selfPeerId || '').trim();

  if (!roomId) {
    return res.status(400).json({ error: 'room query param is required' });
  }

  if (selfPeerId) {
    touchRoomMember(roomId, selfPeerId);
  }

  const room = roomMembers.get(roomId) || new Map();

  // Remove stale peers (best-effort, in-memory only)
  const cutoff = Date.now() - 60 * 1000;
  room.forEach((lastSeenAt, peerId) => {
    if (lastSeenAt < cutoff) {
      room.delete(peerId);
    }
  });
  cleanupRoom(roomId);

  const peers = Array.from((roomMembers.get(roomId) || new Map()).keys())
    .filter((id) => !selfPeerId || id !== selfPeerId);

  return res.json({ peers });
});

// API: remove a peer from room tracking when they leave
app.post('/api/room/leave', (req, res) => {
  const roomId = String((req.body && req.body.roomId) || '').trim();
  const peerId = String((req.body && req.body.peerId) || '').trim();

  if (!roomId || !peerId) {
    return res.status(400).json({ error: 'roomId and peerId are required' });
  }

  const room = roomMembers.get(roomId);
  if (room) {
    room.delete(peerId);
    cleanupRoom(roomId);
  }

  return res.json({ ok: true });
});

// API: list available sign-language videos from assets/videos
app.get('/api/videos', async (req, res) => {
  try {
    const videosDir = path.join(__dirname, '..', 'assets', 'videos');
    const files = [];

    async function walk(dir, relativePrefix = '') {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const absPath = path.join(dir, entry.name);
        const relPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          await walk(absPath, relPath);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.mp4')) {
          files.push(relPath);
        }
      }
    }

    await walk(videosDir);

    res.json({ files });
  } catch (error) {
    // Keep the app usable even if assets/videos is missing or unreadable.
    res.json({ files: [] });
  }
});

// API: provide a shareable base URL (prefers LAN IP when app is opened on localhost)
app.get('/api/network-info', async (req, res) => {
  const hostHeader = String(req.headers.host || '');
  const port = hostHeader.includes(':') ? hostHeader.split(':')[1] : String(process.env.PORT || 3000);
  const hostname = hostHeader.split(':')[0];
  const protocol = req.protocol || 'http';

  const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
  let lanBaseUrl = null;

  if (isLocalHost) {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const list = interfaces[name] || [];
      for (const item of list) {
        if (item && item.family === 'IPv4' && !item.internal) {
          lanBaseUrl = `${protocol}://${item.address}:${port}`;
          break;
        }
      }
      if (lanBaseUrl) break;
    }
  }

  // Public URL preference:
  // 1) PUBLIC_BASE_URL env var (manual override)
  // 2) ngrok local API auto-detection
  let publicBaseUrl = process.env.PUBLIC_BASE_URL || null;
  if (!publicBaseUrl) {
    publicBaseUrl = await getNgrokPublicUrl();
  }

  res.json({
    origin: `${protocol}://${hostHeader}`,
    lanBaseUrl,
    publicBaseUrl,
    isLocalHost
  });
});

// Page routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'home.html'));
});
app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'about.html'));
});
app.get('/features', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'features.html'));
});
app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'contact.html'));
});
app.get('/call', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'call.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`MOUNA server running at http://localhost:${PORT}`);
});
