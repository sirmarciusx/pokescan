/**
 * Card Detail Modal Component - Displays full card breakdown, pricing variants, condition, and actions
 */
import { currency } from '../services/currencyService.js';
import { storage } from '../services/storageService.js';
import { sound } from '../services/soundService.js';
import { initHoloTilt } from './holographicCard.js';

let confettiFn = null;
async function getConfetti() {
  if (confettiFn) return confettiFn;
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.4/+esm');
    confettiFn = mod.default || mod;
  } catch (e) {
    // fallback
  }
  return confettiFn;
}

export class CardDetailModal {
  constructor({ modalElement, contentElement, onClose, onCollectionChange }) {
    this.modal = modalElement;
    this.content = contentElement;
    this.onClose = onClose;
    this.onCollectionChange = onCollectionChange;
    this.currentCard = null;
    this.selectedCondition = 'NM';
    this.selectedVariant = 'holofoil';

    this.bindEvents();
  }

  bindEvents() {
    const btnClose = this.modal.querySelector('#btnCloseCardModal');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.hide());
    }

    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.hide();
    });
  }

  async show(card) {
    this.currentCard = card;
    this.selectedCondition = 'NM';
    
    if (card.prices?.holofoil > 0) {
      this.selectedVariant = 'holofoil';
    } else if (card.prices?.reverseHolofoil > 0) {
      this.selectedVariant = 'reverseHolofoil';
    } else {
      this.selectedVariant = 'normal';
    }

    const isAlreadySaved = await storage.hasCard(card.id);
    this.render(card, isAlreadySaved);
    this.modal.classList.remove('hidden');

    const cardEl = this.content.querySelector('.holo-card');
    if (cardEl) initHoloTilt(cardEl);

    // Rare card celebration check
    if (card.marketPriceUsd > 30 || (card.rarity && (card.rarity.toLowerCase().includes('secret') || card.rarity.toLowerCase().includes('special')))) {
      sound.playRareFanfare();
      const fireConfetti = await getConfetti();
      if (fireConfetti) {
        fireConfetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#00F0FF', '#FFD700', '#FF2A55', '#FFFFFF']
        });
      }
    } else {
      sound.playSuccess();
    }
  }

  hide() {
    this.modal.classList.add('hidden');
    if (this.onClose) this.onClose();
  }

  render(card, isSaved) {
    const marketPriceUsd = card.marketPriceUsd || card.prices?.market || 0;
    const isUltra = card.rarity && (card.rarity.includes('Ultra') || card.rarity.includes('Secret') || card.rarity.includes('Special') || card.rarity.includes('VMAX') || card.rarity.includes('ex'));
    
    const typeBadges = (card.types || []).map(t => `<span class="card-badge" style="border-color: var(--type-${t.toLowerCase()}, var(--accent-cyan)); color: var(--type-${t.toLowerCase()}, var(--accent-cyan))">${t}</span>`).join('');
    
    const attacksHtml = (card.attacks || []).map(a => `
      <div class="attack-item">
        <div class="attack-header">
          <span class="attack-name">${a.name}</span>
          ${a.damage ? `<span class="attack-damage">${a.damage}</span>` : ''}
        </div>
        ${a.text ? `<p class="attack-text">${a.text}</p>` : ''}
      </div>
    `).join('');

    const cardImgUrl = card.images?.large || card.images?.small || 'https://images.pokemontcg.io/sv3pt5/199_hires.png';

    this.content.innerHTML = `
      <div class="holo-card-container">
        <div class="holo-card">
          <img src="${cardImgUrl}" alt="${card.name}" class="holo-card-img" crossorigin="anonymous" />
          <div class="holo-card-glare"></div>
          <div class="holo-card-sparkles"></div>
        </div>
      </div>

      <div class="card-meta-header">
        <div class="card-title-group">
          <h2 class="card-title-name">${card.name}</h2>
          <div class="card-subtitle-set">
            <span>${card.set?.name || 'Coleção TCG'}</span>
            <span>•</span>
            <span>#${card.number || '?'}${card.set?.total ? `/${card.set.total}` : ''}</span>
          </div>
        </div>
        ${card.hp ? `
          <div class="card-hp-badge">
            <span class="card-hp-label">HP</span>
            <span class="card-hp-val">${card.hp}</span>
          </div>
        ` : ''}
      </div>

      <div class="card-tags-row">
        ${typeBadges}
        <span class="card-badge ${isUltra ? 'rarity-ultra' : 'rarity-holo'}">${card.rarity || 'Carta TCG'}</span>
        ${card.artist ? `<span class="card-badge">🎨 ${card.artist}</span>` : ''}
      </div>

      <div class="pricing-section">
        <div class="pricing-header">
          <span class="pricing-title">COTAÇÃO DE MERCADO</span>
          <span class="pricing-source">TCGplayer / Live</span>
        </div>

        <div class="hero-price-box">
          <div class="hero-price-info">
            <span class="hero-price-label">Preço de Mercado Atual</span>
            <span class="hero-price-amount" id="modalHeroPriceBrl">${currency.format(marketPriceUsd)}</span>
          </div>
          <div class="hero-price-alt">
            <span>${currency.format(marketPriceUsd, 'USD')}</span>
          </div>
        </div>

        <div class="condition-picker-section">
          <span class="section-subtitle">Estado de Conservação:</span>
          <div class="condition-buttons-row">
            <button class="btn-condition active" data-cond="NM" title="Near Mint (Perfeita - 100%)">NM (100%)</button>
            <button class="btn-condition" data-cond="LP" title="Lightly Played (Leves marcas - 85%)">LP (85%)</button>
            <button class="btn-condition" data-cond="MP" title="Moderately Played (Marcas médias - 70%)">MP (70%)</button>
            <button class="btn-condition" data-cond="DMG" title="Damaged (Danificada - 30%)">DMG (30%)</button>
          </div>
        </div>

        <div class="price-variants-grid">
          <div class="price-variant-card">
            <span class="variant-name">Normal</span>
            <span class="variant-val">${currency.format(card.prices?.normal || 0)}</span>
          </div>
          <div class="price-variant-card">
            <span class="variant-name">Holo Foil</span>
            <span class="variant-val highlight">${currency.format(card.prices?.holofoil || marketPriceUsd)}</span>
          </div>
          <div class="price-variant-card">
            <span class="variant-name">Rev. Holo</span>
            <span class="variant-val">${currency.format(card.prices?.reverseHolofoil || 0)}</span>
          </div>
        </div>
      </div>

      ${attacksHtml ? `
        <div class="card-attacks-list">
          <span class="section-subtitle">Ataques e Habilidades:</span>
          ${attacksHtml}
        </div>
      ` : ''}

      <div class="card-modal-actions">
        <button id="btnToggleSaveCard" class="btn-add-collection">
          <span id="btnSaveText">${isSaved ? '✓ Salva no seu Binder' : '➕ Adicionar à Minha Coleção'}</span>
        </button>

        <div class="external-market-links">
          <a href="${card.links?.tcgplayer || '#'}" target="_blank" rel="noopener noreferrer" class="btn-market-link">
            <span>Ver no TCGplayer</span> ↗
          </a>
          <a href="${card.links?.ligapokemon || '#'}" target="_blank" rel="noopener noreferrer" class="btn-market-link">
            <span>🇧🇷 LigaPokémon</span> ↗
          </a>
        </div>
      </div>
    `;

    this.bindDynamicCardActions(card, isSaved);
  }

  bindDynamicCardActions(card, isInitialSaved) {
    let isSaved = isInitialSaved;
    const btnSave = this.content.querySelector('#btnToggleSaveCard');
    const btnSaveText = this.content.querySelector('#btnSaveText');
    const heroPriceBrl = this.content.querySelector('#modalHeroPriceBrl');

    const condBtns = this.content.querySelectorAll('.btn-condition');
    condBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        condBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedCondition = btn.dataset.cond;

        const multipliers = { NM: 1.0, LP: 0.85, MP: 0.70, DMG: 0.30 };
        const mult = multipliers[this.selectedCondition] || 1.0;
        const adjusted = (card.marketPriceUsd || 0) * mult;
        
        if (heroPriceBrl) {
          heroPriceBrl.textContent = currency.format(adjusted);
        }
        sound.playTap();
      });
    });

    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        if (isSaved) {
          await storage.removeCard(card.id);
          isSaved = false;
          btnSaveText.textContent = '➕ Adicionar à Minha Coleção';
          sound.playTap();
        } else {
          await storage.saveCard({
            ...card,
            condition: this.selectedCondition,
            variant: this.selectedVariant
          });
          isSaved = true;
          btnSaveText.textContent = '✓ Salva no seu Binder';
          sound.playSuccess();
        }

        if (this.onCollectionChange) {
          this.onCollectionChange();
        }
      });
    }
  }
}
