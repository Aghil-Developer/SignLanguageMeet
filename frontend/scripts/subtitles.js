class SubtitleManager {
  constructor(panelId) {
    this.panel = document.getElementById(panelId);
    this.currentLang = 'en';
    this.lines = [];
    this.maxLines = 20;
    this.translationCache = new Map();
    this.lastFinalNormalized = '';
    this.translationChain = Promise.resolve();

    this.langMap = {
      'en': 'en',
      'te': 'te', 
      'ta': 'ta', 
      'ml': 'ml'  
    };
  }

  setLanguage(langCode) {
    this.currentLang = langCode;
  }

  normalizeText(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .trim();
  }

  postProcessText(text) {
    const cleaned = this.normalizeText(text);
    if (!cleaned) return '';

    const first = cleaned.charAt(0).toUpperCase();
    const rest = cleaned.slice(1);
    const punctuated = /[.!?]$/.test(cleaned) ? cleaned : `${first}${rest}.`;
    return punctuated;
  }

  getNormalizedKey(text) {
    return this.normalizeText(text).toLowerCase();
  }

  pushFinalLine(line) {
    this.lines.push(line);
    if (this.lines.length > this.maxLines) {
      this.lines.shift();
    }
  }

  addLine(text, isFinal, metadata = {}) {
    if (!text) return;
    const sourceText = this.normalizeText(text);
    if (!sourceText) return;

    const confidence = typeof metadata.confidence === 'number' ? metadata.confidence : 1;

    if (isFinal && confidence < 0.2) {
      return;
    }

    if (!isFinal) {
      this.render(sourceText);
      return;
    }

    const normalizedFinal = this.getNormalizedKey(sourceText);
    if (normalizedFinal === this.lastFinalNormalized) {
      return;
    }
    this.lastFinalNormalized = normalizedFinal;

    const finalText = this.postProcessText(sourceText);
    const langSnapshot = this.currentLang;

    this.translationChain = this.translationChain.then(async () => {
      let displayText = finalText;
      if (langSnapshot !== 'en') {
        displayText = await this.translate(finalText, langSnapshot);
      }

      this.pushFinalLine(displayText);
      this.render(null);
    }).catch((err) => {
      console.warn('Subtitle processing failed:', err);
      this.pushFinalLine(finalText);
      this.render(null);
    });
  }

  async fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  async translateWithLibre(text, targetLang) {
    const res = await this.fetchWithTimeout('https://libretranslate.de/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: text,
        source: 'en',
        target: targetLang,
        format: 'text'
      })
    }, 3500);

    if (!res.ok) {
      throw new Error(`LibreTranslate failed with ${res.status}`);
    }

    const data = await res.json();
    if (data && data.translatedText) {
      return this.normalizeText(data.translatedText);
    }

    throw new Error('LibreTranslate returned empty response');
  }

  async translateWithMyMemory(text, targetLang) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`;
    const res = await this.fetchWithTimeout(url, {}, 5000);

    if (!res.ok) {
      throw new Error(`MyMemory failed with ${res.status}`);
    }

    const data = await res.json();
    if (data.responseData && data.responseData.translatedText) {
      return this.normalizeText(data.responseData.translatedText);
    }

    throw new Error('MyMemory returned empty response');
  }

  async translate(text, targetLang) {
    const supportedLang = this.langMap[targetLang] || 'en';
    if (supportedLang === 'en') return text;

    const cacheKey = `${supportedLang}:${text}`;
    if (this.translationCache.has(cacheKey)) {
      return this.translationCache.get(cacheKey);
    }

    let translated = text;

    try {
      try {
        translated = await this.translateWithLibre(text, supportedLang);
      } catch (primaryErr) {
        translated = await this.translateWithMyMemory(text, supportedLang);
      }
    } catch (err) {
      console.warn('Translation failed, showing original:', err);
      translated = text;
    }

    this.translationCache.set(cacheKey, translated);
    return translated;
  }

  render(interimText) {
    if (!this.panel) return;
    const subtitleContent = this.panel.querySelector('.subtitle-content');
    if (!subtitleContent) return;

    let html = '';
    this.lines.forEach(line => {
      html += `<div class="subtitle-line">${this.escapeHtml(line)}</div>`;
    });
    if (interimText) {
      html += `<div class="subtitle-line" style="opacity:0.6;font-style:italic">${this.escapeHtml(interimText)}</div>`;
    }
    subtitleContent.innerHTML = html;
    subtitleContent.scrollTop = subtitleContent.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
