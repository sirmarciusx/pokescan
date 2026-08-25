/**
 * OCR Service - Local client-side card text & collector number extraction
 * Enhanced with promo code parsing, multi-pass filters & fuzzy Pokémon name resolution
 */

const CANONICAL_POKEMON = [
  'Pikachu', 'Raichu', 'Pichu', 'Charizard', 'Charmander', 'Charmeleon',
  'Blastoise', 'Squirtle', 'Wartortle', 'Bulbasaur', 'Ivysaur', 'Venusaur',
  'Mewtwo', 'Mew', 'Eevee', 'Vaporeon', 'Jolteon', 'Flareon', 'Espeon',
  'Umbreon', 'Leafeon', 'Glaceon', 'Sylveon', 'Gengar', 'Haunter', 'Gastly',
  'Lucario', 'Rayquaza', 'Lugia', 'Ho-Oh', 'Giratina', 'Dialga', 'Palkia',
  'Arceus', 'Dragonite', 'Gyarados', 'Snorlax', 'Garchomp', 'Tyranitar',
  'Greninja', 'Gardevoir', 'Mimikyu', 'Zacian', 'Zamazenta', 'Koraidon',
  'Miraidon', 'Ogerpon', 'Terapagos', 'Roaring Moon', 'Iron Valiant',
  'Alakazam', 'Machamp', 'Gengar', 'Zapdos', 'Moltres', 'Articuno',
  'Celebi', 'Jirachi', 'Deoxys', 'Darkrai', 'Shaymin', 'Reshiram',
  'Zekrom', 'Kyurem', 'Xerneas', 'Yveltal', 'Lunala', 'Solgaleo'
];

class OcrService {
  constructor() {
    this.worker = null;
    this.isInitializing = false;
  }

  async getWorker() {
    if (this.worker) return this.worker;
    if (this.isInitializing) {
      while (this.isInitializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      return this.worker;
    }

    this.isInitializing = true;
    try {
      const T = window.Tesseract || (await import('https://cdn.jsdelivr.net/npm/tesseract.js@5/+esm'));
      if (T && T.createWorker) {
        this.worker = await T.createWorker('eng', 1, {
          logger: () => {}
        });
      }
    } catch (e) {
      console.warn('Erro ao inicializar Tesseract OCR:', e);
    } finally {
      this.isInitializing = false;
    }
    return this.worker;
  }

  /**
   * Process a card image canvas/data URL and extract candidate card name & number
   */
  async recognizeCard(sourceCanvas) {
    let canvas = sourceCanvas;
    if (typeof sourceCanvas === 'string') {
      canvas = await this.loadImageToCanvas(sourceCanvas);
    }

    const worker = await this.getWorker();
    if (!worker) {
      throw new Error('Mecanismo de OCR não disponível.');
    }

    // 1. Process Bottom Footer (68% to 100% height - captures numbers, promos & set symbols)
    const bottomCanvas = this.cropCanvasRegion(canvas, 0, 0.68, 1.0, 0.32);
    const bottomBw = this.applyContrastBinarization(bottomCanvas);
    
    // 2. Process Top Header (top 20% - captures Pokemon Name)
    const topCanvas = this.cropCanvasRegion(canvas, 0, 0, 0.90, 0.22);
    const topBw = this.applyContrastBinarization(topCanvas);

    // Run OCR on both segments in parallel
    const [resBottom, resTop] = await Promise.all([
      worker.recognize(bottomBw),
      worker.recognize(topBw)
    ]);

    const bottomText = (resBottom?.data?.text || '').trim();
    const topText = (resTop?.data?.text || '').trim();
    const fullText = `${topText}\n${bottomText}`;

    // Extract Number & Set Total
    let number = '';
    let setTotal = '';

    // Pattern 1: Fraction e.g. "025/165", "58/102", "173/165", "TG05/TG30", "GG30/GG70"
    const fractionMatch = bottomText.match(/([a-zA-Z]{0,4}\s*\d{1,4}[a-zA-Z]?)\s*[\/|\\]\s*([a-zA-Z]{0,4}\s*\d{1,4})/i);
    if (fractionMatch) {
      number = fractionMatch[1].replace(/\s+/g, '');
      setTotal = fractionMatch[2].replace(/\s+/g, '');
    }

    // Pattern 2: Promo codes e.g. "SWSH020", "SVP 027", "SM162", "XY95", "TG05"
    if (!number) {
      const promoMatch = bottomText.match(/\b(SWSH|SVP|SM|XY|BW|DP|HGSS|WP|TG|GG|RC|PROMO)\s*([0-9]{1,4})\b/i);
      if (promoMatch) {
        number = `${promoMatch[1].toUpperCase()}${promoMatch[2].padStart(3, '0')}`;
      }
    }

    // Pattern 3: Standalone numbers
    if (!number) {
      const singleNumMatch = bottomText.match(/\b(\d{1,4})\b/);
      if (singleNumMatch) {
        number = singleNumMatch[1];
      }
    }

    // Extract Name from top text
    let candidateName = this.extractCleanName(topText);

    // If candidateName matches a known Pokemon via fuzzy matching, resolve it
    const fuzzyName = this.fuzzyMatchPokemon(candidateName || fullText);
    if (fuzzyName) {
      candidateName = fuzzyName;
    }

    return {
      name: candidateName,
      number: number,
      setTotal: setTotal,
      rawText: fullText
    };
  }

  extractCleanName(topText) {
    let cleaned = topText
      .replace(/HP\s*\d+/gi, '')
      .replace(/PV\s*\d+/gi, '')
      .replace(/PS\s*\d+/gi, '')
      .replace(/BASIC|STAGE\s*[12]|VMAX|VSTAR|TERA|EX|GX|LEGEND/gi, '')
      .replace(/[0-9]/g, '')
      .replace(/[^a-zA-Záàâãéèêíïóôõöúçñ\s-]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const lines = cleaned.split('\n').map(l => l.trim()).filter(l => l.length >= 3);
    return lines[0] || cleaned;
  }

  fuzzyMatchPokemon(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    // Check direct substring
    for (const name of CANONICAL_POKEMON) {
      if (lower.includes(name.toLowerCase())) {
        return name;
      }
    }

    // Check common OCR misspellings for Pikachu & popular Pokemon
    if (/p[i1l|]k[a4][cç][h|]?[uü]/i.test(lower)) return 'Pikachu';
    if (/ch[a4]r[i1l]z[a4]rd/i.test(lower)) return 'Charizard';
    if (/bl[a4]st[o0][i1]se/i.test(lower)) return 'Blastoise';
    if (/m[e3]wtw[o0]/i.test(lower)) return 'Mewtwo';
    if (/g[e3]ng[a4]r/i.test(lower)) return 'Gengar';
    if (/umbr[e3][o0]n/i.test(lower)) return 'Umbreon';
    if (/l[uü]c[a4]r[i1][o0]/i.test(lower)) return 'Lucario';

    return null;
  }

  cropCanvasRegion(srcCanvas, startXRatio, startYRatio, widthRatio, heightRatio) {
    const cropCanvas = document.createElement('canvas');
    const sx = Math.floor(srcCanvas.width * startXRatio);
    const sy = Math.floor(srcCanvas.height * startYRatio);
    const sw = Math.floor(srcCanvas.width * widthRatio);
    const sh = Math.floor(srcCanvas.height * heightRatio);

    cropCanvas.width = sw;
    cropCanvas.height = sh;
    const ctx = cropCanvas.getContext('2d');
    ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
    return cropCanvas;
  }

  applyContrastBinarization(srcCanvas) {
    const canvas = document.createElement('canvas');
    canvas.width = srcCanvas.width;
    canvas.height = srcCanvas.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(srcCanvas, 0, 0);

    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;

    for (let i = 0; i < d.length; i += 4) {
      const avg = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const val = avg > 128 ? 255 : 0;
      d[i] = val;
      d[i + 1] = val;
      d[i + 2] = val;
    }

    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }

  loadImageToCanvas(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }
}

export const ocrService = new OcrService();
