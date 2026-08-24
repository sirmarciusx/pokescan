/**
 * Search Modal Component - Instant manual search and discovery fallback
 */
import { pokemonApi } from '../services/pokemonApi.js';
import { currency } from '../services/currencyService.js';
import { sound } from '../services/soundService.js';

export class SearchModal {
  constructor({ modalElement, onSelectCard }) {
    this.modal = modalElement;
    this.onSelectCard = onSelectCard;

    this.input = document.getElementById('inputGlobalSearch');
    this.resultsList = document.getElementById('searchResultsList');
    this.btnClear = document.getElementById('btnClearSearch');
    this.btnClose = document.getElementById('btnCloseSearchModal');

    this.debounceTimer = null;
    this.bindEvents();
  }

  bindEvents() {
    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.hide());
    }

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });

    if (this.input) {
      this.input.addEventListener('input', () => {
        const val = this.input.value;
        if (this.btnClear) {
          if (val.length > 0) this.btnClear.classList.remove('hidden');
          else this.btnClear.classList.add('hidden');
        }

        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.performSearch(val), 350);
      });
    }

    if (this.btnClear) {
      this.btnClear.addEventListener('click', () => {
        if (this.input) {
          this.input.value = '';
          this.btnClear.classList.add('hidden');
          this.input.focus();
          this.resetPlaceholder();
        }
      });
    }

    // Quick suggestion tags
    const quickTags = this.modal.querySelectorAll('.quick-tag');
    quickTags.forEach(tag => {
      tag.addEventListener('click', () => {
        const query = tag.dataset.query;
        if (this.input) {
          this.input.value = query;
          if (this.btnClear) this.btnClear.classList.remove('hidden');
          sound.playTap();
          this.performSearch(query);
        }
      });
    });
  }

  show() {
    this.modal.classList.remove('hidden');
    if (this.input) {
      this.input.focus();
      if (!this.input.value) {
        this.resetPlaceholder();
      }
    }
  }

  hide() {
    this.modal.classList.add('hidden');
  }

  resetPlaceholder() {
    if (this.resultsList) {
      this.resultsList.innerHTML = `
        <div class="search-placeholder">
          <i data-lucide="sparkles"></i>
          <p>Digite o nome do Pokémon ou número da carta para consultar valores instantaneamente.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
    }
  }

  async performSearch(query) {
    const term = query.trim();
    if (!term || term.length < 2) {
      this.resetPlaceholder();
      return;
    }

    if (this.resultsList) {
      this.resultsList.innerHTML = `
        <div class="search-placeholder">
          <div class="status-spinner" style="width: 28px; height: 28px;"></div>
          <p>Buscando cartas no banco de dados oficial...</p>
        </div>
      `;
    }

    // Check if query has number pattern (e.g. "Charizard 4/102" or "199")
    let searchName = term;
    let searchNumber = '';
    const numMatch = term.match(/(\d{1,3})(\/|\s+)?(\d{1,3})?$/);
    if (numMatch) {
      searchNumber = numMatch[1];
      searchName = term.replace(numMatch[0], '').trim();
    }

    const results = await pokemonApi.searchCards({ name: searchName || term, number: searchNumber });

    if (!this.resultsList) return;

    if (results.length === 0) {
      this.resultsList.innerHTML = `
        <div class="search-placeholder">
          <i data-lucide="alert-circle"></i>
          <p>Nenhuma carta encontrada para "${term}". Verifique a digitação ou tente o nome em inglês.</p>
        </div>
      `;
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    this.resultsList.innerHTML = results.map(card => {
      const img = card.images?.small || card.images?.large || '';
      const price = card.marketPriceUsd || card.prices?.market || 0;

      return `
        <div class="search-result-item" data-id="${card.id}">
          <img src="${img}" alt="${card.name}" class="search-result-thumb" loading="lazy" />
          <div class="search-result-details">
            <span class="search-result-title">${card.name}</span>
            <span class="search-result-set">${card.set?.name || 'Coleção'} #${card.number || ''} • ${card.rarity || 'Comum'}</span>
          </div>
          <div class="search-result-price">
            ${currency.format(price)}
          </div>
        </div>
      `;
    }).join('');

    // Attach click listeners to cards
    this.resultsList.querySelectorAll('.search-result-item').forEach(itemEl => {
      itemEl.addEventListener('click', () => {
        const id = itemEl.dataset.id;
        const card = results.find(c => c.id === id);
        if (card) {
          this.hide();
          if (this.onSelectCard) this.onSelectCard(card);
        }
      });
    });
  }
}
