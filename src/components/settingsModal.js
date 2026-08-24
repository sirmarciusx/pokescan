/**
 * Settings Component - Manages user preferences, Gemini API Key, currencies and sounds
 */
import { storage } from '../services/storageService.js';
import { currency } from '../services/currencyService.js';
import { sound } from '../services/soundService.js';

export class SettingsModal {
  constructor({ onCurrencyChange }) {
    this.onCurrencyChange = onCurrencyChange;

    this.inputApiKey = document.getElementById('inputGeminiApiKey');
    this.btnSaveKey = document.getElementById('btnSaveApiKey');
    this.selectCurrency = document.getElementById('selectDefaultCurrency');
    this.toggleSound = document.getElementById('toggleSoundFx');
    this.toggleHaptics = document.getElementById('toggleHaptics');
    this.rateDisplay = document.getElementById('settingExchangeRate');

    this.init();
  }

  init() {
    // Load saved API key
    if (this.inputApiKey) {
      this.inputApiKey.value = storage.getGeminiKey();
    }

    // Load Currency
    if (this.selectCurrency) {
      this.selectCurrency.value = currency.getCurrency();
      this.selectCurrency.addEventListener('change', () => {
        currency.setCurrency(this.selectCurrency.value);
        this.updateRateDisplay();
        if (this.onCurrencyChange) this.onCurrencyChange(this.selectCurrency.value);
      });
    }

    // Load Sound
    const soundPref = localStorage.getItem('pokescan_sound_enabled');
    const isSoundOn = soundPref !== null ? soundPref === 'true' : true;
    if (this.toggleSound) {
      this.toggleSound.checked = isSoundOn;
      sound.setEnabled(isSoundOn);
      this.toggleSound.addEventListener('change', () => {
        const val = this.toggleSound.checked;
        sound.setEnabled(val);
        localStorage.setItem('pokescan_sound_enabled', String(val));
        if (val) sound.playTap();
      });
    }

    // Load Haptics
    const hapticPref = localStorage.getItem('pokescan_haptics_enabled');
    const isHapticsOn = hapticPref !== null ? hapticPref === 'true' : true;
    if (this.toggleHaptics) {
      this.toggleHaptics.checked = isHapticsOn;
      this.toggleHaptics.addEventListener('change', () => {
        const val = this.toggleHaptics.checked;
        localStorage.setItem('pokescan_haptics_enabled', String(val));
        if (val && navigator.vibrate) navigator.vibrate(40);
      });
    }

    // Save API Key button
    if (this.btnSaveKey && this.inputApiKey) {
      this.btnSaveKey.addEventListener('click', () => {
        const key = this.inputApiKey.value.trim();
        storage.setGeminiKey(key);
        sound.playSuccess();
        alert(key ? 'Chave Gemini salva com sucesso! O reconhecimento visual por IA está ativo.' : 'Chave removida. O app usará o modo OCR local.');
      });
    }

    this.updateRateDisplay();
  }

  updateRateDisplay() {
    if (this.rateDisplay) {
      const rate = currency.getUsdToBrlRate();
      this.rateDisplay.textContent = `R$ ${rate.toFixed(2)}`;
    }
  }
}
