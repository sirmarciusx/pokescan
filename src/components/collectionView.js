/**
 * Collection / Binder View Component - Manages user's saved cards, valuation, filter & export
 */
import { storage } from '../services/storageService.js';
import { currency } from '../services/currencyService.js';
import { sound } from '../services/soundService.js';
import { escapeHtml, sanitizeUrl } from '../utils/sanitize.js';

export class CollectionView {
  constructor({ container, onSelectCard, onNavigateToScanner }) {
    this.container = container;
    this.onSelectCard = onSelectCard;
    this.onNavigateToScanner = onNavigateToScanner;

    this.grid = document.getElementById('collectionGrid');
    this.emptyState = document.getElementById('collectionEmptyState');
    this.filterInput = document.getElementById('inputCollectionFilter');
    this.sortSelect = document.getElementById('selectCollectionSort');
    
    this.totalValEl = document.getElementById('collectionTotalValue');
    this.statCardsEl = document.getElementById('statTotalCards');
    this.statHolosEl = document.getElementById('statTotalHolos');
    this.statRarestEl = document.getElementById('statRarestCard');
    this.headerValEl = document.getElementById('headerCollectionValue');
    this.navBadgeEl = document.getElementById('navCollectionBadge');

    this.allCards = [];
    this.bindEvents();
  }

  bindEvents() {
    if (this.filterInput) {
      this.filterInput.addEventListener('input', () => this.applyFilterAndRender());
    }

    if (this.sortSelect) {
      this.sortSelect.addEventListener('change', () => this.applyFilterAndRender());
    }

    const btnGoScan = document.getElementById('btnEmptyGoScan');
    if (btnGoScan && this.onNavigateToScanner) {
      btnGoScan.addEventListener('click', () => {
        sound.playTap();
        this.onNavigateToScanner();
      });
    }

    // Export collection
    const btnExport = document.getElementById('btnExportCollection');
    if (btnExport) {
      btnExport.addEventListener('click', async () => {
        sound.playTap();
        const exp = await storage.exportCollection('json');
        const blob = new Blob([exp.data], { type: exp.mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = exp.filename;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // Import collection
    const fileImport = document.getElementById('fileImportCollection');
    if (fileImport) {
      fileImport.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const count = await storage.importCollection(text);
          alert(`${count} carta(s) importada(s) com sucesso para sua coleção!`);
          this.refresh();
        } catch (err) {
          alert(`Erro ao importar: ${err.message}`);
        }
      });
    }
  }

  async refresh() {
    this.allCards = await storage.getAllCards();
    const stats = await storage.getCollectionStats();

    const formattedTotal = currency.format(stats.totalUsd);
    if (this.totalValEl) this.totalValEl.textContent = formattedTotal;
    if (this.headerValEl) this.headerValEl.textContent = formattedTotal;
    if (this.statCardsEl) this.statCardsEl.textContent = stats.totalCards;
    if (this.statHolosEl) this.statHolosEl.textContent = stats.totalHolos;
    if (this.navBadgeEl) this.navBadgeEl.textContent = stats.totalCards;

    if (this.statRarestEl) {
      this.statRarestEl.textContent = stats.mostValuable ? stats.mostValuable.name : '-';
    }

    this.applyFilterAndRender();
  }

  applyFilterAndRender() {
    let filtered = [...this.allCards];
    const query = (this.filterInput?.value || '').toLowerCase().trim();
    const sort = this.sortSelect?.value || 'val_desc';

    if (query) {
      filtered = filtered.filter(c => 
        (c.name && c.name.toLowerCase().includes(query)) ||
        (c.set?.name && c.set.name.toLowerCase().includes(query)) ||
        (c.rarity && c.rarity.toLowerCase().includes(query)) ||
        (c.types && c.types.some(t => t.toLowerCase().includes(query)))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      const priceA = (a.marketPriceUsd || 0);
      const priceB = (b.marketPriceUsd || 0);

      if (sort === 'val_desc') return priceB - priceA;
      if (sort === 'val_asc') return priceA - priceB;
      if (sort === 'date_desc') return (b.dateAdded || 0) - (a.dateAdded || 0);
      if (sort === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      return 0;
    });

    this.renderCards(filtered);
  }

  renderCards(cards) {
    if (!this.grid || !this.emptyState) return;

    if (cards.length === 0) {
      this.grid.innerHTML = '';
      this.emptyState.classList.remove('hidden');
      return;
    }

    this.emptyState.classList.add('hidden');
    this.grid.innerHTML = cards.map(card => {
      const rawImg = card.images?.small || card.images?.large || '';
      const img = escapeHtml(sanitizeUrl(rawImg));
      const price = card.marketPriceUsd || 0;
      const isFoil = card.variant === 'holofoil' || card.variant === 'reverseHolofoil';
      const cardName = escapeHtml(card.name);
      const setName = escapeHtml(card.set?.name || 'Coleção');
      const cardNum = escapeHtml(card.number || '');
      const cardId = escapeHtml(card.id);

      return `
        <div class="collection-card-item" data-id="${cardId}">
          <div class="card-item-img-wrap">
            <img src="${img}" alt="${cardName}" loading="lazy" />
            ${isFoil ? `<span class="card-item-foil-badge">FOIL</span>` : ''}
          </div>
          <div class="card-item-info">
            <span class="card-item-name">${cardName}</span>
            <span class="card-item-set">${setName} #${cardNum}</span>
            <span class="card-item-price">${currency.format(price)}</span>
          </div>
        </div>
      `;
    }).join('');

    this.grid.querySelectorAll('.collection-card-item').forEach(itemEl => {
      itemEl.addEventListener('click', () => {
        const id = itemEl.dataset.id;
        const card = this.allCards.find(c => c.id === id);
        if (card && this.onSelectCard) {
          sound.playTap();
          this.onSelectCard(card);
        }
      });
    });
  }
}
