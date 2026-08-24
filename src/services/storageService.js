/**
 * Storage Service - IndexedDB and LocalStorage persistence for user collection
 */
const DB_NAME = 'PokeScanDB';
const DB_VERSION = 1;
const STORE_COLLECTION = 'collection';

class StorageService {
  constructor() {
    this.db = null;
    this.initPromise = this.initDB();
  }

  async initDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn('IndexedDB não suportado, usando LocalStorage fallback.');
        resolve(null);
        return;
      }

      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_COLLECTION)) {
          const store = db.createObjectStore(STORE_COLLECTION, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('dateAdded', 'dateAdded', { unique: false });
          store.createIndex('marketPrice', 'marketPrice', { unique: false });
        }
      };

      req.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      req.onerror = (e) => {
        console.error('Erro ao abrir IndexedDB:', e);
        resolve(null);
      };
    });
  }

  // Save or update a card in the collection
  async saveCard(card) {
    await this.initPromise;
    const item = {
      id: card.id || `card_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      name: card.name,
      set: card.set || {},
      number: card.number || '',
      images: card.images || {},
      rarity: card.rarity || 'Common',
      types: card.types || [],
      hp: card.hp || '',
      tcgplayer: card.tcgplayer || {},
      cardmarket: card.cardmarket || {},
      marketPriceUsd: parseFloat(card.marketPriceUsd) || 0,
      condition: card.condition || 'NM', // NM, LP, MP, HP, DMG
      variant: card.variant || 'normal', // normal, holofoil, reverseHolofoil
      notes: card.notes || '',
      dateAdded: card.dateAdded || Date.now()
    };

    if (this.db) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_COLLECTION, 'readwrite');
        const store = tx.objectStore(STORE_COLLECTION);
        store.put(item);
        tx.oncomplete = () => resolve(item);
        tx.onerror = (e) => reject(e);
      });
    } else {
      // LocalStorage fallback
      const collection = this.getLocalStorageCollection();
      const existingIdx = collection.findIndex(c => c.id === item.id);
      if (existingIdx >= 0) {
        collection[existingIdx] = item;
      } else {
        collection.unshift(item);
      }
      localStorage.setItem('pokescan_collection_fallback', JSON.stringify(collection));
      return item;
    }
  }

  // Remove a card from the collection
  async removeCard(cardId) {
    await this.initPromise;
    if (this.db) {
      return new Promise((resolve, reject) => {
        const tx = this.db.transaction(STORE_COLLECTION, 'readwrite');
        const store = tx.objectStore(STORE_COLLECTION);
        store.delete(cardId);
        tx.oncomplete = () => resolve(true);
        tx.onerror = (e) => reject(e);
      });
    } else {
      let collection = this.getLocalStorageCollection();
      collection = collection.filter(c => c.id !== cardId);
      localStorage.setItem('pokescan_collection_fallback', JSON.stringify(collection));
      return true;
    }
  }

  // Check if a card is already in the collection
  async hasCard(cardId) {
    await this.initPromise;
    const all = await this.getAllCards();
    return all.some(c => c.id === cardId);
  }

  // Get all saved cards
  async getAllCards() {
    await this.initPromise;
    if (this.db) {
      return new Promise((resolve) => {
        const tx = this.db.transaction(STORE_COLLECTION, 'readonly');
        const store = tx.objectStore(STORE_COLLECTION);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    } else {
      return this.getLocalStorageCollection();
    }
  }

  getLocalStorageCollection() {
    try {
      const data = localStorage.getItem('pokescan_collection_fallback');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  // Calculate total binder valuation and stats
  async getCollectionStats() {
    const cards = await this.getAllCards();
    let totalUsd = 0;
    let totalHolos = 0;
    let mostValuable = null;

    cards.forEach(card => {
      let price = card.marketPriceUsd || 0;
      
      // Condition discount multiplier
      const multipliers = { NM: 1.0, LP: 0.85, MP: 0.70, HP: 0.50, DMG: 0.30 };
      const conditionMultiplier = multipliers[card.condition] || 1.0;
      const adjustedPrice = price * conditionMultiplier;

      totalUsd += adjustedPrice;

      if (card.variant === 'holofoil' || card.variant === 'reverseHolofoil' || (card.rarity && card.rarity.toLowerCase().includes('holo'))) {
        totalHolos++;
      }

      if (!mostValuable || adjustedPrice > (mostValuable.adjustedPrice || 0)) {
        mostValuable = { ...card, adjustedPrice };
      }
    });

    return {
      totalCards: cards.length,
      totalUsd,
      totalHolos,
      mostValuable
    };
  }

  // Export collection as JSON or CSV
  async exportCollection(format = 'json') {
    const cards = await this.getAllCards();
    if (format === 'csv') {
      const headers = ['ID', 'Nome', 'Colecao', 'Numero', 'Raridade', 'Variante', 'Condicao', 'Preco_USD', 'Data_Adicionada'];
      const rows = cards.map(c => [
        `"${c.id}"`,
        `"${c.name.replace(/"/g, '""')}"`,
        `"${(c.set?.name || '').replace(/"/g, '""')}"`,
        `"${c.number}"`,
        `"${c.rarity}"`,
        `"${c.variant}"`,
        `"${c.condition}"`,
        c.marketPriceUsd || 0,
        `"${new Date(c.dateAdded).toISOString()}"`
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      return { data: csvContent, filename: `pokescan_colecao_${Date.now()}.csv`, mime: 'text/csv;charset=utf-8;' };
    } else {
      const jsonContent = JSON.stringify(cards, null, 2);
      return { data: jsonContent, filename: `pokescan_colecao_${Date.now()}.json`, mime: 'application/json' };
    }
  }

  // Import collection from JSON
  async importCollection(jsonString) {
    try {
      const items = JSON.parse(jsonString);
      if (!Array.isArray(items)) throw new Error('O formato do arquivo deve ser um array JSON de cartas.');
      
      let importedCount = 0;
      for (const item of items) {
        if (item.name) {
          await this.saveCard(item);
          importedCount++;
        }
      }
      return importedCount;
    } catch (err) {
      throw new Error(`Falha ao importar coleção: ${err.message}`);
    }
  }

  // Gemini API Key storage
  getGeminiKey() {
    return localStorage.getItem('pokescan_gemini_key') || '';
  }

  setGeminiKey(key) {
    if (key) {
      localStorage.setItem('pokescan_gemini_key', key.trim());
    } else {
      localStorage.removeItem('pokescan_gemini_key');
    }
  }
}

export const storage = new StorageService();
