class SignPlayer {
  constructor() {
    this.container = null;
    this.videoEl = null;
    this.wordEl = null;
    this.isActive = false;
    this.queue = [];
    this.playing = false;
    this.init();
  }

  init() {
    this.container = document.createElement('div');
    this.container.className = 'sign-player';
    this.container.id = 'signPlayer';
    this.container.innerHTML = `
      <div class="sign-player-header">
        <span>&#9995; Sign Language</span>
        <button class="close-sign" id="closeSign">&times;</button>
      </div>
      <video id="signVideo" muted playsinline></video>
      <div class="sign-player-word" id="signWord">Waiting for speech...</div>
    `;
    document.body.appendChild(this.container);

    this.videoEl = document.getElementById('signVideo');
    this.wordEl = document.getElementById('signWord');

    document.getElementById('closeSign').addEventListener('click', () => this.hide());

    this.videoEl.addEventListener('ended', () => {
      this.playing = false;
      this.playNext();
    });

    this.videoEl.addEventListener('error', () => {
      this.wordEl.textContent = `Video not found, skipping...`;
      this.playing = false;
      setTimeout(() => this.playNext(), 500);
    });
  }

  show() {
    this.isActive = true;
    this.container.classList.add('active');
  }

  hide() {
    this.isActive = false;
    this.container.classList.remove('active');
    this.videoEl.pause();
    this.queue = [];
    this.playing = false;
  }

  toggle() {
    if (this.isActive) this.hide();
    else this.show();
  }

  enqueue(word) {
    this.enqueueVideo({ file: `${word.toLowerCase()}.mp4`, label: word.toLowerCase() });
  }

  enqueueVideo(item) {
    if (!item || !item.file) return;

    if (!this.isActive) {
      this.show();
    }

    this.queue.push({
      file: String(item.file),
      label: String(item.label || item.file.replace(/\.mp4$/i, ''))
    });

    if (!this.playing) this.playNext();
  }

  playNext() {
    if (this.queue.length === 0) {
      this.wordEl.textContent = 'Waiting for speech...';
      return;
    }
    const nextItem = this.queue.shift();
    this.playing = true;
    this.wordEl.textContent = `Signing: "${nextItem.label}"`;
    const encodedPath = String(nextItem.file)
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    this.videoEl.src = `/assets/videos/${encodedPath}`;
    this.videoEl.play().catch(() => {
      // autoplay blocked or file missing
      this.playing = false;
      this.playNext();
    });
  }
}
