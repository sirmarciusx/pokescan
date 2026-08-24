/**
 * Currency Service - Real-time USD to BRL/EUR exchange rates & formatters
 */
class CurrencyService {
  constructor() {
    this.rates = {
      USD: 1.0,
      BRL: 5.75, // Default fallback
      EUR: 0.92
    };
    this.currentCurrency = localStorage.getItem('pokescan_currency') || 'BRL';
    this.lastFetched = 0;
    this.init();
  }

  async init() {
    await this.fetchRates();
  }

  async fetchRates() {
    const cached = localStorage.getItem('pokescan_rates_cache');
    const cachedTime = localStorage.getItem('pokescan_rates_time');
    
    // Use cached rate if less than 6 hours old
    if (cached && cachedTime && (Date.now() - parseInt(cachedTime, 10)) < 6 * 3600 * 1000) {
      try {
        this.rates = JSON.parse(cached);
        return;
      } catch (e) {
        // Continue to fetch
      }
    }

    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (res.ok) {
        const data = await res.json();
        if (data && data.rates) {
          this.rates.BRL = data.rates.BRL || 5.75;
          this.rates.EUR = data.rates.EUR || 0.92;
          this.rates.USD = 1.0;
          
          localStorage.setItem('pokescan_rates_cache', JSON.stringify(this.rates));
          localStorage.setItem('pokescan_rates_time', Date.now().toString());
        }
      }
    } catch (err) {
      console.warn('Usando cotação padrão offline USD/BRL:', err);
    }
  }

  setCurrency(currencyCode) {
    if (['BRL', 'USD', 'EUR'].includes(currencyCode)) {
      this.currentCurrency = currencyCode;
      localStorage.setItem('pokescan_currency', currencyCode);
    }
  }

  getCurrency() {
    return this.currentCurrency;
  }

  getUsdToBrlRate() {
    return this.rates.BRL || 5.75;
  }

  /**
   * Converts a USD amount to the currently selected currency and formats it
   * @param {number|string} usdAmount - The price in USD
   * @param {string} [targetCurrency] - Optional specific currency override
   * @returns {string} Formatted string, e.g. "R$ 149,90" or "$25.00"
   */
  format(usdAmount, targetCurrency = this.currentCurrency) {
    const num = parseFloat(usdAmount);
    if (isNaN(num) || num <= 0) {
      return targetCurrency === 'BRL' ? 'R$ --' : '$ --';
    }

    const rate = this.rates[targetCurrency] || 1.0;
    const converted = num * rate;

    if (targetCurrency === 'BRL') {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(converted);
    } else if (targetCurrency === 'EUR') {
      return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(converted);
    } else {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(converted);
    }
  }

  /**
   * Returns converted numeric value
   */
  convert(usdAmount, targetCurrency = this.currentCurrency) {
    const num = parseFloat(usdAmount) || 0;
    const rate = this.rates[targetCurrency] || 1.0;
    return num * rate;
  }
}

export const currency = new CurrencyService();
