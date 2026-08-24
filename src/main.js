/**
 * PokeScan TCG - Main Application Bootstrap
 */
import { CameraScanner } from './components/cameraScanner.js';
import { CardDetailModal } from './components/cardDetailModal.js';
import { CollectionView } from './components/collectionView.js';
import { SearchModal } from './components/searchModal.js';
import { SettingsModal } from './components/settingsModal.js';
import { pokemonApi } from './services/pokemonApi.js';
import { geminiVision } from './services/geminiVision.js';
import { ocrService } from './services/ocrService.js';
import { currency } from './services/currencyService.js';
import { sound } from './services/soundService.js';
import { storage } from './services/storageService.js';

class App {
  constructor() {
    this.currentTab = 'scanner';
    this.scanMode = 'ai'; // 'ai' or 'ocr'

    // DOM Elements
    this.viewPanels = {
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
    // 1. Initialize Lucide Icons
    if (window.lucide) {
      window.lucide.createIcons();
    }

    // 2. Initialize Modals & Views
    this.cardModal = new CardDetailModal({
      modalElement: document.getElementById('cardDetailModal'),
      contentElement: document.getElementById('cardModalContent'),
      onCollectionChange: () => this.collectionView.refresh()
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
      }
    });

    // 3. Initialize Camera Scanner
    this.scanner = new CameraScanner({
      videoElement: document.getElementById('cameraVideo'),
      canvasElement: document.getElementById('captureCanvas'),
      frameElement: document.getElementById('cardFrame'),
      onCapture: (canvas) => this.processScan(canvas)
    });

    // Start Camera on load
    await this.scanner.startCamera();

    // 4. Bind Global Navigation and Controls
    this.bindNavigation();
    this.bindScannerControls();
    this.bindCurrencyToggle();

    // 5. Initial Collection Data Load
    await this.collectionView.refresh();
    this.updateCurrencyUI();

    // 6. Register PWA Service Worker if available
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

    // Update active nav button
    this.navItems.forEach(item => {
      if (item.dataset.tab === tabId) item.classList.add('active');
      else if (item.dataset.tab !== 'search') item.classList.remove('active');
    });

    // Update active view panel
    Object.keys(this.viewPanels).forEach(key => {
      if (key === tabId) {
        this.viewPanels[key].classList.add('active');
      } else {
        this.viewPanels[key].classList.remove('active');
      }
    });

    // Manage camera active state
    if (tabId === 'scanner') {
      this.scanner.startCamera();
    } else {
      this.scanner.stopCamera();
    }

    if (tabId === 'collection') {
      this.collectionView.refresh();
    }

    if (window.lucide) window.lucide.createIcons();
  }

  bindScannerControls() {
    // Mode Switcher (AI vs OCR)
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

    // Flash / Torch toggle
    const btnTorch = document.getElementById('btnToggleTorch');
    if (btnTorch) {
      btnTorch.addEventListener('click', async () => {
        const isOn = await this.scanner.toggleTorch();
        btnTorch.classList.toggle('active', isOn);
      });
    }

    // Camera Switch (Front/Back)
    const btnSwitch = document.getElementById('btnSwitchCamera');
    if (btnSwitch) {
      btnSwitch.addEventListener('click', () => this.scanner.switchCamera());
    }

    // Zoom Buttons
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

    // Main Shutter Button
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

    // Upload from Gallery Button
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

    // Quick Search Button on scanner bottom bar
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

      // MODE 1: Gemini Vision AI
      if (this.scanMode === 'ai' && storage.getGeminiKey()) {
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

      // MODE 2: Local OCR Fallback / Primary
      if (!candidateName) {
        this.showStatus('Lendo número e nome da carta...');
        const ocrResult = await ocrService.recognizeCard(canvas);
        if (ocrResult) {
          candidateName = ocrResult.name;
          candidateNumber = ocrResult.number;
        }
      }

      this.showStatus('Buscando cotações e dados...');

      // Search Card in Pokémon TCG databases
      let results = [];
      if (candidateName || candidateNumber) {
        results = await pokemonApi.searchCards({
          name: candidateName,
          number: candidateNumber
        });
      }

      this.hideStatus();

      if (results && results.length > 0) {
        const topCard = results[0];
        this.cardModal.show(topCard);
      } else {
        // No match found
        this.showToast('Carta não reconhecida com precisão. Tente focar melhor ou busque manualmente.', 'error');
        // Open search modal with partial name if available
        if (candidateName) {
          this.searchModal.show();
          if (this.searchModal.input) {
            this.searchModal.input.value = candidateName;
            this.searchModal.performSearch(candidateName);
          }
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
    toast.innerHTML = `<span>${message}</span>`;
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
      navigator.serviceWorker.register('./service-worker.js').catch(() => {});
    }
  }
}

// Start application when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  window.pokeApp = new App();
});
