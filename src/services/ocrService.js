/**
 * OCR Service - Local client-side card text & collector number extraction
 */
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
   * @param {HTMLCanvasElement|string} sourceCanvas
   * @returns {Promise<{name: string, number: string, setTotal: string, rawText: string}>}
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

    // 1. Process Bottom Footer (best for collector number e.g. "025/165")
    const bottomCanvas = this.cropCanvasRegion(canvas, 0, 0.80, 1.0, 0.20);
    const bottomBw = this.applyContrastBinarization(bottomCanvas);
    
    // 2. Process Top Header (best for Card Name e.g. "Charizard ex")
    const topCanvas = this.cropCanvasRegion(canvas, 0, 0, 0.85, 0.18);
    const topBw = this.applyContrastBinarization(topCanvas);

    // Run OCR on both segments in parallel
    const [resBottom, resTop] = await Promise.all([
      worker.recognize(bottomBw),
      worker.recognize(topBw)
    ]);

    const bottomText = resBottom?.data?.text || '';
    const topText = resTop?.data?.text || '';
    const fullText = `${topText}\n${bottomText}`;

    // Extract Collector Number: matches patterns like 199/165, 025/198, 4/102, 151 / 165
    let number = '';
    let setTotal = '';
    const numberMatch = bottomText.match(/(\d{1,3})\s*[\/|\\]\s*(\d{1,3})/);
    if (numberMatch) {
      number = numberMatch[1];
      setTotal = numberMatch[2];
    } else {
      const singleNumMatch = bottomText.match(/\b(\d{1,3})\b/);
      if (singleNumMatch) number = singleNumMatch[1];
    }

    // Extract Name from top text
    let cleanedName = topText
      .replace(/HP\s*\d+/gi, '')
      .replace(/PV\s*\d+/gi, '')
      .replace(/PS\s*\d+/gi, '')
      .replace(/[0-9]/g, '')
      .replace(/[^a-zA-Záàâãéèêíïóôõöúçñ\s-]/gi, '')
      .trim();

    const nameLines = cleanedName.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    const candidateName = nameLines[0] || '';

    return {
      name: candidateName,
      number: number,
      setTotal: setTotal,
      rawText: fullText
    };
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
      const val = avg > 130 ? 255 : 0;
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
