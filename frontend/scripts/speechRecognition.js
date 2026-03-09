// MOUNA – Speech Recognition using browser Web Speech API
// Uses Chrome/Edge built-in speech recognition (powered by Google/Microsoft models)
class SpeechRecognizer {
  constructor() {
    this.recognition = null;
    this.currentLang = 'en-US';
    this.isListening = false;
    this.supported = false;
    this.activeSession = false;
    this.restartTimer = null;
    this.slowRestartTimer = null; // Only show "restarting" if gap > 1.5s

    this.onResult = null;       // callback(transcript, isFinal, metadata)
    this.onWordDetected = null; // callback(word)
    this.onStatusChange = null; // callback(status) – 'listening' | 'restarting' | 'stopped' | 'error'
    this.onError = null;        // callback(message, errorCode)

    this.lastFinalText = '';
    this.lastInterimText = '';
    this.wordDedupWindowMs = 1200;
    this.wordLastSeenAt = new Map();

    this.init();
  }

  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('[STT] Speech Recognition is not supported. Use Chrome or Edge.');
      this.setStatus('error');
      return;
    }

    this.supported = true;
    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;
    this.recognition.lang = this.currentLang;

    this.recognition.onstart = () => {
      this.activeSession = true;
      // Cancel the slow-restart indicator since we're back
      if (this.slowRestartTimer) {
        clearTimeout(this.slowRestartTimer);
        this.slowRestartTimer = null;
      }
      this.setStatus('listening');
    };

    this.recognition.onend = () => {
      this.activeSession = false;
      if (this.isListening) {
        // Restart silently — only show "restarting" if it takes > 1.5s
        this.slowRestartTimer = setTimeout(() => {
          this.slowRestartTimer = null;
          if (this.isListening && !this.activeSession) {
            this.setStatus('restarting');
          }
        }, 1500);
        this.scheduleRestart(150);
      } else {
        this.setStatus('stopped');
      }
    };

    this.recognition.onerror = (event) => {
      const error = event.error;
      // Mark session as inactive so restart can proceed
      this.activeSession = false;

      // 'aborted' happens when we call stop() intentionally
      if (error === 'aborted') return;

      const fatalErrors = new Set(['not-allowed', 'service-not-allowed', 'audio-capture']);
      if (fatalErrors.has(error)) {
        this.isListening = false;
        this.setStatus('error');
        if (this.onError) {
          const messages = {
            'not-allowed': 'Microphone permission denied. Allow microphone access and retry.',
            'service-not-allowed': 'Speech recognition service is blocked by the browser.',
            'audio-capture': 'No microphone device found. Connect a microphone and retry.'
          };
          this.onError(messages[error] || 'Speech recognition failed.', error);
        }
        return;
      }

      // Retry only recoverable errors.
      if (this.isListening) {
        const delay = error === 'network' ? 1000 : 300;
        this.scheduleRestart(delay);
      }
    };

    this.recognition.onresult = (event) => {
      let interimText = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = this.normalizeText(
          result[0] && result[0].transcript ? result[0].transcript : ''
        );
        if (!transcript) continue;

        if (result.isFinal) {
          finalText += transcript + ' ';
        } else {
          interimText += transcript + ' ';
        }
      }

      const now = Date.now();

      // Emit interim results for live subtitles
      const cleanInterim = this.normalizeText(interimText);
      if (cleanInterim && cleanInterim !== this.lastInterimText && this.onResult) {
        this.lastInterimText = cleanInterim;
        this.onResult(cleanInterim, false, {
          confidence: event.results[event.resultIndex]
            ? (event.results[event.resultIndex][0].confidence || 0.7)
            : 0.7,
          timestamp: now
        });

        // Trigger sign matching while user is still speaking.
        this.emitWords(cleanInterim, now);
      }

      // Emit final results
      const cleanFinal = this.normalizeText(finalText);
      if (!cleanFinal) return;
      if (cleanFinal.toLowerCase() === this.lastFinalText.toLowerCase()) return;

      this.lastFinalText = cleanFinal;
      const confidence = event.results[event.resultIndex]
        ? (event.results[event.resultIndex][0].confidence || 0.85)
        : 0.85;

      if (this.onResult) {
        this.onResult(cleanFinal, true, { confidence, timestamp: now });
      }
      this.emitWords(cleanFinal, now);
    };
  }

  setStatus(status) {
    if (this.onStatusChange) {
      try { this.onStatusChange(status); } catch (_) {}
    }
  }

  scheduleRestart(delayMs = 150) {
    if (!this.supported || !this.recognition || !this.isListening) return;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.startRecognition();
    }, delayMs);
  }

  startRecognition() {
    if (!this.supported || !this.recognition) return;
    // If still active, stop first then restart
    if (this.activeSession) {
      try { this.recognition.stop(); } catch (_) {}
      this.activeSession = false;
      this.scheduleRestart(300);
      return;
    }
    try {
      this.recognition.start();
    } catch (err) {
      const message = err && err.message ? err.message : String(err || 'Unknown STT start error');
      this.activeSession = false;

      // Do not loop forever on permission-related failures.
      if (/not-allowed|permission|denied/i.test(message)) {
        this.isListening = false;
        this.setStatus('error');
        if (this.onError) {
          this.onError('Microphone permission denied. Allow microphone access and retry.', 'not-allowed');
        }
        return;
      }

      this.scheduleRestart(500);
    }
  }

  stopRecognition() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.slowRestartTimer) {
      clearTimeout(this.slowRestartTimer);
      this.slowRestartTimer = null;
    }
    if (!this.recognition) return;
    try {
      this.recognition.stop();
    } catch (_) {
      // Ignore if already stopped
    }
    this.activeSession = false;
  }

  normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  cleanupSeenWords(now = Date.now()) {
    this.wordLastSeenAt.forEach((ts, word) => {
      if (now - ts > this.wordDedupWindowMs * 4) {
        this.wordLastSeenAt.delete(word);
      }
    });
  }

  emitWords(text, now = Date.now()) {
    if (!text || !this.onWordDetected) return;

    const words = String(text).toLowerCase().split(/\s+/);
    words.forEach((word) => {
      const clean = word.replace(/[^a-z0-9]/g, '');
      if (!clean) return;

      const lastSeen = this.wordLastSeenAt.get(clean) || 0;
      if (now - lastSeen < this.wordDedupWindowMs) return;

      this.wordLastSeenAt.set(clean, now);
      this.onWordDetected(clean);
    });

    if (this.wordLastSeenAt.size > 300) {
      this.cleanupSeenWords(now);
    }
  }

  async start() {
    if (!this.supported || this.isListening) return;

    this.isListening = true;
    this.lastFinalText = '';
    this.lastInterimText = '';
    this.startRecognition();
  }

  stop() {
    if (!this.isListening) return;
    this.isListening = false;
    this.stopRecognition();
    this.setStatus('stopped');
  }

  toggle() {
    if (this.isListening) this.stop();
    else this.start();
    return this.isListening;
  }

  setLanguage(langCode) {
    this.currentLang = langCode || 'en-US';
    if (this.recognition) {
      this.recognition.lang = this.currentLang;
      if (this.isListening) {
        this.stopRecognition();
        this.scheduleRestart(200);
      }
    }
  }
}
