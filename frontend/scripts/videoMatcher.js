class VideoMatcher {
  constructor(signPlayer) {
    this.signPlayer = signPlayer;
    this.wordToFileMap = new Map();
    this.processedWords = new Set();
    this.resetTimer = null;
    this.isReady = false;
    this.initPromise = null;
  }

  normalizeWord(word) {
    return String(word || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  async init() {
    if (this.isReady) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const res = await fetch('/api/videos');
        const data = await res.json();
        const files = Array.isArray(data.files) ? data.files : [];

        this.wordToFileMap.clear();

        files.forEach((fileName) => {
          const fileOnly = String(fileName).split('/').pop() || String(fileName);
          const baseName = fileOnly.replace(/\.mp4$/i, '');
          const normalizedBase = this.normalizeWord(baseName);
          if (normalizedBase) {
            this.wordToFileMap.set(normalizedBase, fileName);
          }

          baseName
            .toLowerCase()
            .split(/[_\-\s]+/)
            .forEach((token) => {
              const normalizedToken = this.normalizeWord(token);
              if (normalizedToken && !this.wordToFileMap.has(normalizedToken)) {
                this.wordToFileMap.set(normalizedToken, fileName);
              }
            });
          const tokens = baseName
            .toLowerCase()
            .split(/[_\-\s]+/)
            .map((t) => this.normalizeWord(t))
            .filter(Boolean);

          for (let i = 0; i < tokens.length; i++) {
            const two = tokens.slice(i, i + 2).join('');
            const three = tokens.slice(i, i + 3).join('');
            if (two.length > 1 && !this.wordToFileMap.has(two)) {
              this.wordToFileMap.set(two, fileName);
            }
            if (three.length > 1 && !this.wordToFileMap.has(three)) {
              this.wordToFileMap.set(three, fileName);
            }
          }
        });

        this.isReady = true;

        console.log(`Loaded ${files.length} sign videos.`);
      } catch (error) {
        console.warn('Could not load video index from /api/videos:', error);
        this.isReady = false;
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  enqueueMatch(key, label) {
    const matchedFile = this.wordToFileMap.get(key);
    if (matchedFile) {
      this.signPlayer.enqueueVideo({
        file: matchedFile,
        label: label || key
      });
      return true;
    }
    return false;
  }

  enqueueSpelling(word) {
    const letters = String(word || '').split('');
    let matchedAny = false;

    letters.forEach((letter) => {
      const cleanLetter = this.normalizeWord(letter);
      if (!cleanLetter) return;

      const didMatch = this.enqueueMatch(cleanLetter, cleanLetter.toUpperCase());
      if (didMatch) matchedAny = true;
    });

    return matchedAny;
  }

  processWord(word) {
    if (!this.isReady) return;

    const clean = this.normalizeWord(word);
    if (!clean) return;

    if (this.processedWords.has(clean)) return;
    this.processedWords.add(clean);

    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => {
      this.processedWords.clear();
    }, 3000);

    const hasDirectMatch = this.enqueueMatch(clean, clean);

    if (!hasDirectMatch && clean.length > 1) {
      this.enqueueSpelling(clean);
    }
  }

  processText(text) {
    if (!this.isReady) return;

    const words = String(text)
      .toLowerCase()
      .split(/\s+/)
      .map((w) => this.normalizeWord(w))
      .filter(Boolean);

    for (let i = 0; i < words.length; i++) {
      const trigram = words.slice(i, i + 3).join('');
      const bigram = words.slice(i, i + 2).join('');
      if (trigram.length > 1 && this.enqueueMatch(trigram, words.slice(i, i + 3).join(' '))) {
        continue;
      }
      if (bigram.length > 1 && this.enqueueMatch(bigram, words.slice(i, i + 2).join(' '))) {
        continue;
      }
      this.processWord(words[i]);
    }
  }
}
