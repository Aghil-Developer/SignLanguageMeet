// MOUNA – WebRTC Video Call via PeerJS
class VideoCall {
  constructor() {
    this.peer = null;
    this.peerId = '';
    this.localStream = null;
    this.calls = new Map();
    this.dataConns = new Map();
    this.remoteStreams = new Map();
    this.pendingConnections = new Set();
    this.roomId = null;
    this.isMuted = false;
    this.isCameraOff = false;
    this.onRemoteStreamAdded = null;
    this.onRemoteStreamRemoved = null;
    this.onDataMessage = null;
    this.discoveryTimer = null;
  }

  async getMediaWithFallback() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Media devices API is not available in this browser.');
    }

    const attempts = [
      { video: true, audio: true },
      { video: true, audio: false },
      { video: false, audio: true }
    ];

    let lastError = null;
    for (const constraints of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        return stream;
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Unable to access camera or microphone.');
  }

  updateLocalPreviewState() {
    const localVideo = document.getElementById('localVideo');
    if (!localVideo) return;

    localVideo.style.opacity = this.isCameraOff ? '0.25' : '1';
    localVideo.style.filter = this.isCameraOff ? 'grayscale(1)' : 'none';
  }

  async init(roomId, _isCreator) {
    this.roomId = roomId;

    // Get local media
    try {
      this.localStream = await this.getMediaWithFallback();
    } catch (err) {
      console.error('Camera/mic access denied:', err);
      alert('Unable to access camera/microphone. Check browser permissions and confirm no other app is blocking your devices.');
      return false;
    }

    // Show local video
    const localVideo = document.getElementById('localVideo');
    if (localVideo) {
      localVideo.srcObject = this.localStream;
    }

    // Initialize state based on actual granted tracks.
    this.isMuted = this.localStream.getAudioTracks().every((track) => !track.enabled);
    this.isCameraOff = this.localStream.getVideoTracks().every((track) => !track.enabled);
    this.updateLocalPreviewState();

    // Create peer connection with unique participant ID for multi-user rooms.
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const peerId = `${roomId}-${Date.now()}-${randomSuffix}`;
    this.peerId = peerId;

    const peerOptions = {
      host: location.hostname,
      path: '/peerjs',
      secure: location.protocol === 'https:'
    };

    // For tunneled/public URLs (no explicit port), let PeerJS use default 80/443.
    if (location.port) {
      peerOptions.port = Number(location.port);
    }

    this.peer = new Peer(peerId, peerOptions);

    return new Promise((resolve) => {
      this.peer.on('open', async (id) => {
        console.log('My peer ID:', id);

        // Listen for incoming calls
        this.peer.on('call', (call) => {
          call.answer(this.localStream);
          this.handleCall(call);
        });

        // All peers can receive data-channel connections.
        this.peer.on('connection', (conn) => {
          this.handleDataConnection(conn);
        });

        await this.registerAndConnectExistingPeers();
        this.startPeerDiscovery();

        resolve(true);
      });

      this.peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        resolve(false);
      });
    });
  }

  shouldInitiateTo(remotePeerId) {
    if (!this.peerId || !remotePeerId) return false;
    return this.peerId < remotePeerId;
  }

  async registerAndConnectExistingPeers() {
    try {
      const res = await fetch('/api/room/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: this.roomId, peerId: this.peerId })
      });

      const data = await res.json();
      const peers = Array.isArray(data.peers) ? data.peers : [];
      peers.forEach((peerId) => this.maybeConnectToPeer(peerId));
    } catch (err) {
      console.warn('Room join registration failed:', err);
    }
  }

  async discoverPeers() {
    try {
      const res = await fetch(`/api/room/peers?room=${encodeURIComponent(this.roomId)}&selfPeerId=${encodeURIComponent(this.peerId)}`);
      const data = await res.json();
      const peers = Array.isArray(data.peers) ? data.peers : [];
      peers.forEach((peerId) => this.maybeConnectToPeer(peerId));
    } catch (err) {
      console.warn('Peer discovery failed:', err);
    }
  }

  startPeerDiscovery() {
    this.stopPeerDiscovery();
    this.discoverPeers();
    this.discoveryTimer = setInterval(() => {
      this.discoverPeers();
    }, 2000);
  }

  stopPeerDiscovery() {
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
  }

  maybeConnectToPeer(remotePeerId) {
    if (!remotePeerId || remotePeerId === this.peerId) return;
    if (!this.shouldInitiateTo(remotePeerId)) return;

    const hasCall = this.calls.has(remotePeerId);
    const hasConn = this.dataConns.has(remotePeerId);
    const isPending = this.pendingConnections.has(remotePeerId);
    if (hasCall && hasConn) return;
    if (isPending) return;

    this.pendingConnections.add(remotePeerId);

    if (!hasCall) {
      this.callPeer(remotePeerId);
    }
    if (!hasConn) {
      this.connectDataPeer(remotePeerId);
    }

    setTimeout(() => {
      this.pendingConnections.delete(remotePeerId);
    }, 3000);
  }

  callPeer(remotePeerId) {
    if (!this.localStream || !this.peer) return;

    const call = this.peer.call(remotePeerId, this.localStream);
    if (call) {
      this.handleCall(call);
    }
  }

  connectDataPeer(remotePeerId) {
    if (!this.peer) return;
    const conn = this.peer.connect(remotePeerId, { reliable: true });
    this.handleDataConnection(conn);
  }

  startJoinRetries(remotePeerId) {
    const attemptJoin = () => {
      // Stop retrying once media stream and data channel are established.
      if (this.remoteStream && this.dataConn && this.dataConn.open) {
        this.stopJoinRetries();
        return;
      }

      this.joinRetryAttempts += 1;
      this.callPeer(remotePeerId);

      if (!this.dataConn || !this.dataConn.open) {
        this.connectDataPeer(remotePeerId);
      }

      if (this.joinRetryAttempts >= this.maxJoinRetryAttempts) {
        this.stopJoinRetries();
      }
    };

    this.stopJoinRetries();
    this.joinRetryAttempts = 0;

    // Try immediately, then retry periodically for slower remote joins.
    attemptJoin();
    this.joinRetryTimer = setInterval(attemptJoin, 2000);
  }

  stopJoinRetries() {
    if (this.joinRetryTimer) {
      clearInterval(this.joinRetryTimer);
      this.joinRetryTimer = null;
    }
  }

  handleCall(call) {
    if (!call) return;
    const remotePeerId = call.peer;

    const existing = this.calls.get(remotePeerId);
    if (existing && existing !== call) {
      try { existing.close(); } catch (_) {}
    }
    this.calls.set(remotePeerId, call);

    call.on('error', (err) => {
      console.warn('Call error:', err);
    });

    call.on('stream', (remoteStream) => {
      this.remoteStreams.set(remotePeerId, remoteStream);
      if (this.onRemoteStreamAdded) {
        this.onRemoteStreamAdded(remotePeerId, remoteStream);
      }
    });

    call.on('close', () => {
      if (this.calls.get(remotePeerId) === call) {
        this.calls.delete(remotePeerId);
      }

      if (this.remoteStreams.has(remotePeerId)) {
        this.remoteStreams.delete(remotePeerId);
        if (this.onRemoteStreamRemoved) {
          this.onRemoteStreamRemoved(remotePeerId);
        }
      }

      this.pendingConnections.delete(remotePeerId);
    });
  }

  handleDataConnection(conn) {
    if (!conn) return;

    const remotePeerId = conn.peer;
    const existing = this.dataConns.get(remotePeerId);
    if (existing && existing !== conn) {
      try { existing.close(); } catch (_) {}
    }

    this.dataConns.set(remotePeerId, conn);

    conn.on('open', () => {
      console.log('Data channel connected');
      this.pendingConnections.delete(remotePeerId);
    });

    conn.on('data', (payload) => {
      if (this.onDataMessage) {
        this.onDataMessage(payload, remotePeerId);
      }
    });

    conn.on('close', () => {
      if (this.dataConns.get(remotePeerId) === conn) {
        this.dataConns.delete(remotePeerId);
      }
      this.pendingConnections.delete(remotePeerId);
    });
  }

  sendData(payload) {
    let sentCount = 0;
    this.dataConns.forEach((conn) => {
      if (!conn || !conn.open) return;
      try {
        conn.send(payload);
        sentCount += 1;
      } catch (err) {
        console.warn('Failed to send data message:', err);
      }
    });
    return sentCount > 0;
  }

  toggleMute() {
    if (!this.localStream) return null;
    const audioTracks = this.localStream.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0) return null;

    this.isMuted = !this.isMuted;
    audioTracks.forEach(track => {
      track.enabled = !this.isMuted;
    });

    return this.isMuted;
  }

  toggleCamera() {
    if (!this.localStream) return null;
    const videoTracks = this.localStream.getVideoTracks();
    if (!videoTracks || videoTracks.length === 0) return null;

    this.isCameraOff = !this.isCameraOff;
    videoTracks.forEach(track => {
      track.enabled = !this.isCameraOff;
    });

    // Give immediate visual feedback in local preview.
    this.updateLocalPreviewState();

    return this.isCameraOff;
  }

  async requestMissingTrack(kind) {
    if (!this.localStream) return false;

    const needsVideo = kind === 'video' && this.localStream.getVideoTracks().length === 0;
    const needsAudio = kind === 'audio' && this.localStream.getAudioTracks().length === 0;
    if (!needsVideo && !needsAudio) return true;

    try {
      const requested = await navigator.mediaDevices.getUserMedia({
        video: kind === 'video',
        audio: kind === 'audio'
      });

      requested.getTracks().forEach((track) => {
        this.localStream.addTrack(track);
      });

      const localVideo = document.getElementById('localVideo');
      if (localVideo) {
        localVideo.srcObject = this.localStream;
      }

      this.updateLocalPreviewState();
      return true;
    } catch (err) {
      console.warn(`Could not request ${kind} track:`, err);
      return false;
    }
  }

  async leaveRoomRegistry() {
    if (!this.roomId || !this.peerId) return;
    try {
      await fetch('/api/room/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: this.roomId, peerId: this.peerId }),
        keepalive: true
      });
    } catch (_) {
      // Best-effort cleanup only.
    }
  }

  leaveCall() {
    this.stopPeerDiscovery();
    this.leaveRoomRegistry();

    this.calls.forEach((call) => {
      try { call.close(); } catch (_) {}
    });
    this.calls.clear();

    this.dataConns.forEach((conn) => {
      try { conn.close(); } catch (_) {}
    });
    this.dataConns.clear();

    this.remoteStreams.clear();
    this.pendingConnections.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
    }
    if (this.peer) this.peer.destroy();
    window.location.href = '/';
  }
}
