/**
 * Gemini Vision AI Service - Visual identification of Pokémon cards using Gemini Flash
 */
import { storage } from './storageService.js';

class GeminiVisionService {
  /**
   * Identify card from an image Blob or Base64 data URL
   * @param {string|Blob} imageSource - Base64 data URL or Blob
   * @returns {Promise<Object>} Identified card metadata
   */
  async identifyCard(imageSource) {
    const apiKey = storage.getGeminiKey() || (import.meta.env?.VITE_GEMINI_API_KEY || '');
    if (!apiKey) {
      throw new Error('CHAVE_NAO_CONFIGURADA');
    }

    let base64Data = '';
    let mimeType = 'image/jpeg';

    if (typeof imageSource === 'string') {
      const parts = imageSource.split(',');
      if (parts.length === 2) {
        mimeType = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
        base64Data = parts[1];
      } else {
        base64Data = imageSource;
      }
    } else if (imageSource instanceof Blob) {
      mimeType = imageSource.type || 'image/jpeg';
      base64Data = await this.blobToBase64(imageSource);
    }

    const prompt = `You are an expert Pokemon TCG card scanner and evaluator.
Analyze this image and identify the exact Pokemon card shown.
Extract the following information in strict JSON format:
{
  "name": "Exact Card Name in English (e.g. Charizard ex, Pikachu, Iono, Mewtwo VSTAR)",
  "namePt": "Portuguese name if different or standard name",
  "number": "Collector card number only digits (e.g. 199, 25, 4, 151, TG04)",
  "setTotal": "Set total number after slash if visible (e.g. 165, 198, 102)",
  "setName": "Name of the expansion set if recognizable (e.g. 151, Scarlet & Violet, Evolving Skies, Base Set, Crown Zenith)",
  "rarity": "Common, Uncommon, Rare, Double Rare, Ultra Rare, Illustration Rare, Special Illustration Rare, or Secret Rare",
  "isHolo": true or false,
  "supertype": "Pokemon, Trainer, or Energy",
  "confidence": "high, medium, or low"
}
Return ONLY the raw JSON without markdown code fences or other text.`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      }
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      const message = errJson.error?.message || `HTTP ${res.status}`;
      throw new Error(`Erro na API Gemini: ${message}`);
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('Nenhuma resposta retornada pela IA.');
    }

    try {
      const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim());
      return parsed;
    } catch (e) {
      throw new Error('Falha ao processar resposta da IA.');
    }
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const res = reader.result;
        const base64 = res.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

export const geminiVision = new GeminiVisionService();
