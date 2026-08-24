/**
 * Install Modal Component - Prompts user to install PWA or continue in browser
 */
import { sound } from '../services/soundService.js';

export class InstallModal {
  constructor() {
    this.modal = document.getElementById('installAppModal');
    this.btnInstall = document.getElementById('btnInstallPWA');
    this.btnContinue = document.getElementById('btnContinueWeb');
    this.btnClose = document.getElementById('btnCloseInstallModal');
    this.iosGuide = document.getElementById('installIosGuide');
    this.standardView = document.getElementById('installStandardView');
    this.btnIosDone = document.getElementById('btnIosDone');

    this.deferredPrompt = null;
    this.isStandalone = this.checkIsStandalone();
    this.isIos = this.checkIsIos();

    this.init();
  }

  checkIsStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://')
    );
  }

  checkIsIos() {
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) && !window.MSStream;
  }

  init() {
    // Listen for browser install prompt event (Chrome, Edge, Android)
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.checkAndAutoPrompt();
    });

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.hide();
      sound.playFanfare();
    });

    this.bindEvents();

    // If already standalone, do not auto show
    if (this.isStandalone) {
      return;
    }

    // Auto trigger on first load with a slight delay for smooth entry
    setTimeout(() => {
      this.checkAndAutoPrompt();
    }, 1200);
  }

  bindEvents() {
    if (this.btnInstall) {
      this.btnInstall.addEventListener('click', () => this.handleInstallClick());
    }

    if (this.btnContinue) {
      this.btnContinue.addEventListener('click', () => {
        sound.playTap();
        this.dismiss();
      });
    }

    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => {
        sound.playTap();
        this.dismiss();
      });
    }

    if (this.btnIosDone) {
      this.btnIosDone.addEventListener('click', () => {
        sound.playTap();
        this.dismiss();
      });
    }

    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.dismiss();
        }
      });
    }
  }

  checkAndAutoPrompt() {
    if (this.isStandalone) return;

    // Check if user previously dismissed prompt in this session or recently
    const dismissedSession = sessionStorage.getItem('pokescan_install_dismissed');
    const dismissedTime = localStorage.getItem('pokescan_install_dismissed_time');
    
    // If dismissed in current session, do not auto show
    if (dismissedSession) return;

    // If dismissed within the last 24 hours, do not auto show
    if (dismissedTime && (Date.now() - parseInt(dismissedTime, 10)) < 24 * 3600 * 1000) {
      return;
    }

    this.show();
  }

  show() {
    if (!this.modal) return;
    this.resetView();
    this.modal.classList.remove('hidden');
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  hide() {
    if (!this.modal) return;
    this.modal.classList.add('hidden');
  }

  dismiss() {
    sessionStorage.setItem('pokescan_install_dismissed', 'true');
    localStorage.setItem('pokescan_install_dismissed_time', Date.now().toString());
    this.hide();
  }

  resetView() {
    if (this.standardView) this.standardView.classList.remove('hidden');
    if (this.iosGuide) this.iosGuide.classList.add('hidden');
  }

  async handleInstallClick() {
    sound.playTap();

    // 1. If standard beforeinstallprompt is available (Android / Chrome / Edge)
    if (this.deferredPrompt) {
      try {
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          sound.playFanfare();
        }
        this.deferredPrompt = null;
        this.dismiss();
      } catch (err) {
        console.warn('Erro ao disparar prompt de instalação:', err);
        this.dismiss();
      }
      return;
    }

    // 2. If on iOS (Safari)
    if (this.isIos) {
      if (this.standardView && this.iosGuide) {
        this.standardView.classList.add('hidden');
        this.iosGuide.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
      }
      return;
    }

    // 3. Desktop or browser without deferred prompt (already ready in browser menu)
    if (this.standardView && this.iosGuide) {
      // Show manual install guidance
      alert('Para instalar, clique no ícone de instalação na barra de endereço do seu navegador (ou no menu ⋮ -> Instalar PokeScan).');
      this.dismiss();
    }
  }
}
