/**
 * PokeScan TCG - Main Application Bootstrap
 */
import { CameraScanner } from './components/cameraScanner.js';
import { CardDetailModal } from './components/cardDetailModal.js';
import { CollectionView } from './components/collectionView.js';
import { SearchModal } from './components/searchModal.js';
import { SettingsModal } from './components/settingsModal.js';
import { InstallModal } from './components/installModal.js';
import { pokemonApi } from './services/pokemonApi.js';
import { geminiVision } from './services/geminiVision.js';
import { ocrService } from './services/ocrService.js';
import { currency } from './services/currencyService.js';
import { sound } from './services/soundService.js';
import { storage } from './services/storageService.js';
import { escapeHtml } from './utils/sanitize.js';

class App {
  constructor() {
    this.currentTab = 'home';
    this.scanMode = 'ai'; // 'ai' or 'ocr'

    // DOM Elements
    this.viewPanels = {
      home: document.getElementById('viewHome'),
      scanner: document.getElementById('viewScanner'),
      collection: document.getElementById('viewCollection'),
      settings: document.getElementById('viewSettings')
    };

    this.navItems = document.querySelectorAll('.nav-item');
    this.statusBanner = document.getElementById('scannerStatusBanner');
    this.statusText = document.getElementById('scannerStatusText');
    this.toastContainer = document.getElementById('toastContainer');
    this.currencyBtn = document.getElementById('btnToggleCurrency');
    this.currencyLabel = document.getElementById('currentCurrencyLabel');

    this.init();
  }

  async init() {
    if (window.lucide) {
      window.lucide.createIcons();
    }

    this.cardModal = new CardDetailModal({
      modalElement: document.getElementById('cardDetailModal'),
      contentElement: document.getElementById('cardModalContent'),
      onCollectionChange: () => {
        this.collectionView.refresh();
        this.updateHomeDashboard();
      }
    });

    this.searchModal = new SearchModal({
      modalElement: document.getElementById('manualSearchModal'),
      onSelectCard: (card) => this.cardModal.show(card)
    });

    this.collectionView = new CollectionView({
      container: this.viewPanels.collection,
      onSelectCard: (card) => this.cardModal.show(card),
      onNavigateToScanner: () => this.switchTab('scanner')
    });

    this.settingsModal = new SettingsModal({
      onCurrencyChange: () => {
        this.updateCurrencyUI();
        this.collectionView.refresh();
        this.updateHomeDashboard();
      }
    });

    this.installModal = new InstallModal();
    const btnTriggerInstall = document.getElementById('btnTriggerInstallModal');
    if (btnTriggerInstall) {
      btnTriggerInstall.addEventListener('click', () => {
        sound.playTap();
        this.installModal.show();
      });
    }

    this.scanner = new CameraScanner({
      videoElement: document.getElementById('cameraVideo'),
      canvasElement: document.getElementById('captureCanvas'),
      frameElement: document.getElementById('cardFrame'),
      onCapture: (canvas) => this.processScan(canvas)
    });

    // Camera will ONLY start when user clicks "Escanear Carta Agora" or navigates to Scanner tab
    this.bindNavigation();
    this.bindHomeEvents();
    this.bindScannerControls();
    this.bindCurrencyToggle();

    await this.collectionView.refresh();
    await this.updateHomeDashboard();
    this.updateCurrencyUI();

    this.registerServiceWorker();
  }

  bindNavigation() {
    this.navItems.forEach(item => {
      item.addEventListener('click', () => {
        const targetTab = item.dataset.tab;
        sound.playTap();

        if (targetTab === 'search') {
          this.searchModal.show();
          return;
        }

        this.switchTab(targetTab);
      });
    });
  }

  switchTab(tabId) {
    if (!this.viewPanels[tabId]) return;

    this.currentTab = tabId;

    this.navItems.forEach(item => {
      if (item.dataset.tab === tabId) item.classList.add('active');
      else if (item.dataset.tab !== 'search') item.classList.remove('active');
    });

    Object.keys(this.viewPanels).forEach(key => {
      if (key === tabId) {
        this.viewPanels[key].classList.add('active');
      } else {
        this.viewPanels[key].classList.remove('active');
      }
    });

    if (tabId === 'scanner') {
      this.scanner.startCamera();
    } else {
      this.scanner.stopCamera();
    }

    if (tabId === 'home') {
      this.updateHomeDashboard();
    }

    if (tabId === 'collection') {
      this.collectionView.refresh();
    }

    if (window.lucide) window.lucide.createIcons();
  }

  bindHomeEvents() {
    const btnScan = document.getElementById('btnHomeStartScan');
    if (btnScan) {
      btnScan.addEventListener('click', () => {
        sound.playTap();
        this.switchTab('scanner');
      });
    }

    const btnManual = document.getElementById('btnHomeManualSearch');
    if (btnManual) {
      btnManual.addEventListener('click', () => {
        sound.playTap();
        this.searchModal.show();
      });
    }

    const widgetCollection = document.getElementById('widgetHomeCollection');
    if (widgetCollection) {
      widgetCollection.addEventListener('click', () => {
        sound.playTap();
        this.switchTab('collection');
      });
    }

    const widgetTech = document.getElementById('widgetHomeTech');
    if (widgetTech) {
      widgetTech.addEventListener('click', () => {
        sound.playTap();
        this.switchTab('scanner');
      });
    }

    const widgetCurrency = document.getElementById('widgetHomeCurrency');
    if (widgetCurrency) {
      widgetCurrency.addEventListener('click', () => {
        sound.playTap();
        this.switchTab('settings');
      });
    }

    const shortcutChips = document.querySelectorAll('.shortcut-chip');
    shortcutChips.forEach(chip => {
      chip.addEventListener('click', () => {
        sound.playTap();
        const query = chip.dataset.query;
        this.searchModal.show();
        if (this.searchModal.input) {
          this.searchModal.input.value = query;
          this.searchModal.performSearch(query);
        }
      });
    });
  }

  async updateHomeDashboard() {
    try {
      const cards = await storage.getAllCards();
      const count = Array.isArray(cards) ? cards.length : 0;
      let totalUsd = 0;
      if (Array.isArray(cards)) {
        cards.forEach(c => {
          totalUsd += (parseFloat(c.marketPriceUsd) || 0);
        });
      }

      const homeVal = document.getElementById('homeCollectionValDisplay');
      const homeCount = document.getElementById('homeCollectionCountDisplay');
      const homeExchange = document.getElementById('homeExchangeTag');

      if (homeVal) homeVal.textContent = currency.format(totalUsd);
      if (homeCount) homeCount.textContent = `${count} ${count === 1 ? 'carta' : 'cartas'}`;
      if (homeExchange) {
        homeExchange.textContent = `${currency.getCurrency()} (${currency.getCurrency() === 'BRL' ? 'R$' : '$'})`;
      }
    } catch (e) {
      console.warn('Erro ao atualizar dashboard da home:', e);
    }
  }

  bindScannerControls() {
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.scanMode = btn.dataset.mode;
        sound.playTap();
        this.showToast(this.scanMode === 'ai' ? 'Modo IA Vision Ativo' : 'Modo OCR Numérico Ativo');
      });
    });

    const btnTorch = document.getElementById('btnToggleTorch');
    if (btnTorch) {
      btnTorch.addEventListener('click', async () => {
        const isOn = await this.scanner.toggleTorch();
        btnTorch.classList.toggle('active', isOn);
      });
    }

    const btnSwitch = document.getElementById('btnSwitchCamera');
    if (btnSwitch) {
      btnSwitch.addEventListener('click', () => this.scanner.switchCamera());
    }

    const zoomBtns = document.querySelectorAll('.zoom-btn');
    zoomBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        zoomBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const zoom = parseFloat(btn.dataset.zoom) || 1.0;
        this.scanner.setZoom(zoom);
        sound.playTap();
      });
    });

    const btnCapture = document.getElementById('btnCaptureScan');
    if (btnCapture) {
      btnCapture.addEventListener('click', () => {
        sound.playShutter();
        if (navigator.vibrate) navigator.vibrate(50);
        const croppedCanvas = this.scanner.captureCardFrame();
        if (croppedCanvas) {
          this.processScan(croppedCanvas);
        } else {
          this.showToast('Câmera indisponível no momento.', 'error');
        }
      });
    }

    const btnUpload = document.getElementById('btnUploadImage');
    const fileInput = document.getElementById('fileImageInput');
    if (btnUpload && fileInput) {
      btnUpload.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        sound.playTap();
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            this.processScan(canvas);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    const btnQuickSearch = document.getElementById('btnQuickSearch');
    if (btnQuickSearch) {
      btnQuickSearch.addEventListener('click', () => {
        sound.playTap();
        this.searchModal.show();
      });
    }
  }

  bindCurrencyToggle() {
    if (this.currencyBtn) {
      this.currencyBtn.addEventListener('click', () => {
        const current = currency.getCurrency();
        const next = current === 'BRL' ? 'USD' : 'BRL';
        currency.setCurrency(next);
        sound.playTap();
        this.updateCurrencyUI();
        this.collectionView.refresh();
      });
    }
  }

  updateCurrencyUI() {
    const cur = currency.getCurrency();
    if (this.currencyLabel) {
      this.currencyLabel.textContent = cur === 'BRL' ? 'BRL (R$)' : 'USD ($)';
    }
  }

  showStatus(text) {
    if (!this.statusBanner || !this.statusText) return;
    this.statusText.textContent = text;
    this.statusBanner.classList.remove('hidden');
    this.scanner.setScanningAnimation(true);
  }

  hideStatus() {
    if (!this.statusBanner) return;
    this.statusBanner.classList.add('hidden');
    this.scanner.setScanningAnimation(false);
  }

  async processScan(canvas) {
    this.showStatus('Analisando carta...');

    try {
      let candidateName = '';
      let candidateNumber = '';

      const hasApiKey = Boolean(storage.getGeminiKey() || import.meta.env?.VITE_GEMINI_API_KEY);

      if (this.scanMode === 'ai' && hasApiKey) {
        try {
          this.showStatus('Consultando IA Vision...');
          const aiResult = await geminiVision.identifyCard(canvas);
          if (aiResult && aiResult.name) {
            candidateName = aiResult.name;
            candidateNumber = aiResult.number || '';
          }
        } catch (aiErr) {
          console.warn('Falha na IA, tentando OCR de contingência:', aiErr);
          this.showStatus('IA indisponível. Lendo via OCR...');
        }
      }

      if (!candidateName && !candidateNumber) {
        this.showStatus('Lendo número e nome da carta...');
        const ocrResult = await ocrService.recognizeCard(canvas);
        if (ocrResult) {
          candidateName = ocrResult.name || '';
          candidateNumber = ocrResult.number || '';
        }
      }

      this.showStatus('Buscando cotações e dados...');

      let results = [];
      if (candidateName || candidateNumber) {
        results = await pokemonApi.searchCards({
          name: candidateName,
          number: candidateNumber,
          rawQuery: `${candidateName} ${candidateNumber}`.trim()
        });
      }

      this.hideStatus();

      if (results && results.length > 0) {
        const topCard = results[0];
        this.cardModal.show(topCard);
      } else {
        this.showToast('Carta não reconhecida com precisão. Abrindo busca manual...', 'error');
        const fillVal = candidateName || candidateNumber || '';
        this.searchModal.show();
        if (this.searchModal.input && fillVal) {
          this.searchModal.input.value = fillVal;
          this.searchModal.performSearch(fillVal);
        }
      }

    } catch (err) {
      console.error('Erro no processamento do scan:', err);
      this.hideStatus();
      this.showToast('Erro ao processar imagem da carta.', 'error');
    }
  }

  showToast(message, type = 'info') {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'error' ? 'toast-error' : (type === 'success' ? 'toast-success' : '')}`;
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('/service-worker.js').catch((err) => {
        console.warn('[PWA] ServiceWorker não registrado:', err);
      });
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.pokeApp = new App();
});
