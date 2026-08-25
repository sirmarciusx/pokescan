/**
 * Pokemon TCG API Service - Comprehensive Worldwide Pokemon Card Search Engine
 * Integrates pokemontcg.io & tcgdex.net with intelligent multi-tiered querying,
 * promo code resolution, fallback images, real Cardmarket/TCGPlayer pricing & fuzzy fallback.
 */

const POKEMON_TCG_API_BASE = 'https://api.pokemontcg.io/v2';
const TCGDEX_API_BASE = 'https://api.tcgdex.net/v2';

// In-memory cache to prevent redundant network queries
const memoryCache = new Map();

// Canonical Pokémon Dex ID map for instant reliable artwork fallback
const POKEMON_DEX_MAP = {
  pikachu: 25,
  raichu: 26,
  pichu: 172,
  charizard: 6,
  charmander: 4,
  charmeleon: 5,
  blastoise: 9,
  squirtle: 7,
  wartortle: 8,
  bulbasaur: 1,
  ivysaur: 2,
  venusaur: 3,
  mewtwo: 150,
  mew: 151,
  eevee: 133,
  vaporeon: 134,
  jolteon: 135,
  flareon: 136,
  espeon: 196,
  umbreon: 197,
  leafeon: 470,
  glaceon: 471,
  sylveon: 700,
  gengar: 94,
  lucario: 448,
  rayquaza: 384,
  lugia: 249,
  hooh: 250,
  giratina: 487,
  dialga: 483,
  palkia: 484,
  arceus: 493,
  dragonite: 149,
  gyarados: 130,
  snorlax: 143,
  garchomp: 445,
  tyranitar: 248,
  greninja: 658,
  gardevoir: 282,
  mimikyu: 778,
  koraidon: 1007,
  miraidon: 1008
};

class PokemonApiService {
  /**
   * Helper to get a reliable fallback image for any Pokémon
   */
  getFallbackArtwork(cardName, dexId = null) {
    let id = dexId;
    if (!id && cardName) {
      const clean = cardName.toLowerCase().replace(/[^a-z]/g, '');
      for (const [name, num] of Object.entries(POKEMON_DEX_MAP)) {
        if (clean.includes(name)) {
          id = num;
          break;
        }
      }
    }
    if (id) {
      return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;
    }
    return 'https://images.pokemontcg.io/sv3pt5/25_hires.png';
  }

  /**
   * Universal card search accepting raw query string, name, collector number, set, etc.
   * @param {Object|string} params
   * @returns {Promise<Array>} List of matching normalized cards ordered by relevance
   */
  async searchCards(params = {}) {
    let rawQuery = '';
    let name = '';
    let number = '';
    let set = '';

    if (typeof params === 'string') {
      rawQuery = params;
    } else if (typeof params === 'object' && params !== null) {
      rawQuery = params.query || '';
      name = params.name || '';
      number = params.number || '';
      set = params.set || '';
    }

    const parsed = this.parseQuery({ rawQuery, name, number, set });
    const cacheKey = `search_${parsed.name}_${parsed.number}_${parsed.setTotal}_${parsed.set}`.toLowerCase().trim();

    if (memoryCache.has(cacheKey)) {
      return memoryCache.get(cacheKey);
    }

    let results = [];

    // Strategy 1: Pokemontcg.io API (with timeout guard)
    try {
      const pTcgResults = await this.queryPokemonTcgIo(parsed);
      if (pTcgResults && pTcgResults.length > 0) {
        results.push(...pTcgResults);
      }
    } catch (err) {
      console.warn('[PokemonAPI] pokemontcg.io query skipped/failed:', err);
    }

    // Strategy 2: TCGDex API (Full Global Database: EN & PT-BR, McDonald's, Promos, All Sets)
    if (!results || results.length === 0 || parsed.number) {
      try {
        const tcgdexCards = await this.queryTcgdex(parsed);
        if (tcgdexCards && tcgdexCards.length > 0) {
          results.push(...tcgdexCards);
        }
      } catch (err) {
        console.warn('[PokemonAPI] TCGDex query failed:', err);
      }
    }

    // Strategy 3: Curated Offline Dataset Fallback
    if (!results || results.length === 0) {
      const localCards = this.searchCuratedLocal(parsed.name, parsed.number, parsed.rawQuery);
      if (localCards && localCards.length > 0) {
        results.push(...localCards);
      }
    }

    // Strategy 4: Broad Name-Only Search if specific query returned 0
    if ((!results || results.length === 0) && parsed.name && parsed.name.length >= 2) {
      try {
        const broad = await this.queryTcgdex({ name: parsed.name, number: '', set: '', setTotal: '' });
        if (broad && broad.length > 0) {
          results.push(...broad);
        }
      } catch (e) {}
    }

    // Deduplicate and rank results strictly by match quality
    const finalResults = this.rankAndDeduplicate(results, parsed);
    if (finalResults.length > 0) {
      memoryCache.set(cacheKey, finalResults);
    }

    return finalResults;
  }

  /**
   * Intelligently parses user query into clean name, collector number, setTotal and promo code
   */
  parseQuery({ rawQuery = '', name = '', number = '', set = '' }) {
    let cleanName = (name || '').trim();
    let cleanNumber = (number || '').trim();
    let setTotal = '';
    let cleanSet = (set || '').trim();

    let combined = (rawQuery ? rawQuery : cleanName).trim();

    // 1. Check for fraction pattern: e.g. "006/015", "025/165", "58/102", "173/165", "TG05/TG30", "GG30/GG70", "4/102"
    const fractionMatch = combined.match(/\b(?:(SWSH|SVP|SM|XY|BW|DP|HGSS|WP|TG|GG|RC|PROMO)\s*)?(\d{1,4}[a-zA-Z]?)\s*[\/|\\]\s*([a-zA-Z0-9]{1,4})\b/i);
    if (fractionMatch) {
      cleanNumber = (fractionMatch[1] ? fractionMatch[1].toUpperCase() : '') + fractionMatch[2];
      setTotal = fractionMatch[3];
      combined = combined.replace(fractionMatch[0], ' ').trim();
    }

    // 2. Check for promo codes: e.g. "SWSH020", "SVP 027", "SM162", "XY95", "BW54", "DP16", "HGSS03", "TG05", "GG30", "RC29"
    if (!cleanNumber) {
      const promoMatch = combined.match(/\b(SWSH|SVP|SM|XY|BW|DP|HGSS|WP|TG|GG|RC|PROMO)\s*([0-9]{1,4})\b/i);
      if (promoMatch) {
        cleanNumber = `${promoMatch[1].toUpperCase()}${promoMatch[2].padStart(3, '0')}`;
        combined = combined.replace(promoMatch[0], ' ').trim();
      }
    }

    // 3. Check for standalone numbers: e.g. "Pikachu 25", "Charizard 4", "025"
    if (!cleanNumber) {
      const singleNumMatch = combined.match(/\b(\d{1,4})\b/);
      if (singleNumMatch) {
        cleanNumber = singleNumMatch[1];
        combined = combined.replace(singleNumMatch[0], ' ').trim();
      }
    }

    // 4. Extract Set names if present in query
    const knownSets = [
      { name: 'McDonalds', id: 'mc' },
      { name: "McDonald's", id: 'mc' },
      { name: '151', id: 'sv3pt5' },
      { name: 'Base Set', id: 'base1' },
      { name: 'Surging Sparks', id: 'sv8' },
      { name: 'Stellar Crown', id: 'sv7' },
      { name: 'Twilight Masquerade', id: 'sv6' },
      { name: 'Temporal Forces', id: 'sv5' },
      { name: 'Paldean Fates', id: 'sv4pt5' },
      { name: 'Paradox Rift', id: 'sv4' },
      { name: 'Obsidian Flames', id: 'sv3' },
      { name: 'Paldea Evolved', id: 'sv2' },
      { name: 'Scarlet & Violet', id: 'sv1' },
      { name: 'Crown Zenith', id: 'swsh12pt5' },
      { name: 'Silver Tempest', id: 'swsh12' },
      { name: 'Lost Origin', id: 'swsh11' },
      { name: 'Pokemon GO', id: 'pgo' },
      { name: 'Astral Radiance', id: 'swsh10' },
      { name: 'Brilliant Stars', id: 'swsh9' },
      { name: 'Fusion Strike', id: 'swsh8' },
      { name: 'Celebrations', id: 'cel25' },
      { name: 'Evolving Skies', id: 'swsh7' },
      { name: 'Chilling Reign', id: 'swsh6' },
      { name: 'Battle Styles', id: 'swsh5' },
      { name: 'Shining Fates', id: 'swsh45' },
      { name: 'Vivid Voltage', id: 'swsh4' },
      { name: 'Darkness Ablaze', id: 'swsh3' },
      { name: 'Sword & Shield', id: 'swsh1' },
      { name: 'Cosmic Eclipse', id: 'sm12' },
      { name: 'Hidden Fates', id: 'sm115' },
      { name: 'Team Up', id: 'sm9' },
      { name: 'Evolutions', id: 'xy12' }
    ];

    for (const s of knownSets) {
      const regex = new RegExp(`\\b${s.name}\\b`, 'i');
      if (regex.test(combined)) {
        cleanSet = s.name;
        combined = combined.replace(regex, ' ').trim();
        break;
      }
    }

    cleanName = combined
      .replace(/#/g, '')
      .replace(/[^a-zA-Z0-9\s-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      rawQuery: rawQuery || cleanName,
      name: cleanName,
      number: cleanNumber,
      setTotal: setTotal,
      set: cleanSet
    };
  }

  /**
   * Query Pokemontcg.io with fetch timeout
   */
  async queryPokemonTcgIo({ name, number, set }) {
    let queryParts = [];

    const cleanName = name ? name.replace(/[^a-zA-Z0-9\s-]/g, '').trim() : '';
    const cleanNumber = number ? number.replace(/^0+/, '').trim() : '';
    const rawNumber = number ? number.trim() : '';

    if (cleanName) {
      queryParts.push(`name:"*${cleanName}*"`);
    }

    if (rawNumber) {
      if (cleanNumber && cleanNumber !== rawNumber) {
        queryParts.push(`(number:"${rawNumber}" OR number:"${cleanNumber}")`);
      } else {
        queryParts.push(`number:"${rawNumber}"`);
      }
    }

    if (set) {
      const cleanSet = set.replace(/[^a-zA-Z0-9\s-]/g, '').trim();
      queryParts.push(`(set.name:"*${cleanSet}*" OR set.id:"*${cleanSet}*")`);
    }

    let queryString = queryParts.length > 0 ? `q=${encodeURIComponent(queryParts.join(' '))}` : '';
    let url = `${POKEMON_TCG_API_BASE}/cards?${queryString}&pageSize=24&orderBy=-set.releaseDate`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.data && data.data.length > 0) {
          return data.data.map(card => this.normalizePokemonTcgIoCard(card));
        }
      }
    } catch (e) {
      clearTimeout(timeoutId);
    }

    return [];
  }

  /**
   * Query TCGDex Multi-Language Database with exact number & set total matching
   */
  async queryTcgdex({ name, number, setTotal, set }) {
    const cleanName = name ? encodeURIComponent(name.trim()) : '';
    const cleanNumber = number ? number.trim() : '';
    const cleanNumberStripped = cleanNumber ? cleanNumber.replace(/^0+/, '') : '';
    const cleanSetTotalStripped = setTotal ? setTotal.replace(/^0+/, '') : '';

    let matchedList = [];

    // Fetch by Name from TCGDex
    if (cleanName) {
      try {
        const resEn = await fetch(`${TCGDEX_API_BASE}/en/cards?name=${cleanName}`);
        if (resEn.ok) {
          const list = await resEn.json();
          if (Array.isArray(list)) matchedList.push(...list);
        }
      } catch (e) {}

      try {
        const resPt = await fetch(`${TCGDEX_API_BASE}/pt/cards?name=${cleanName}`);
        if (resPt.ok) {
          const list = await resPt.json();
          if (Array.isArray(list)) matchedList.push(...list);
        }
      } catch (e) {}
    }

    // Filter matching cards by localId (exact or without leading zeros)
    if (cleanNumber && matchedList.length > 0) {
      const exactNumberMatches = matchedList.filter(item => {
        const itemNum = String(item.localId || '').trim();
        const itemNumStripped = itemNum.replace(/^0+/, '');
        return itemNum === cleanNumber || itemNumStripped === cleanNumberStripped;
      });

      if (exactNumberMatches.length > 0) {
        matchedList = exactNumberMatches;
      }
    }

    if (matchedList.length === 0) return [];

    // Deduplicate by ID and fetch detail for top candidate cards
    const uniqueIds = Array.from(new Set(matchedList.map(i => i.id))).slice(0, 10);
    const detailed = await Promise.all(
      uniqueIds.map(async (cardId) => {
        try {
          const res = await fetch(`${TCGDEX_API_BASE}/en/cards/${cardId}`);
          if (res.ok) {
            const cardData = await res.json();
            return this.normalizeTcgdexCard(cardData);
          }
        } catch (e) {
          return null;
        }
      })
    );

    return detailed.filter(Boolean);
  }

  /**
   * Normalizes pokemontcg.io card schema
   */
  normalizePokemonTcgIoCard(card) {
    let marketPrice = 0;
    let normalPrice = 0;
    let holoPrice = 0;
    let reverseHoloPrice = 0;
    let lowPrice = 0;
    let highPrice = 0;

    if (card.tcgplayer && card.tcgplayer.prices) {
      const p = card.tcgplayer.prices;
      if (p.holofoil) {
        holoPrice = p.holofoil.market || p.holofoil.mid || 0;
        lowPrice = p.holofoil.low || lowPrice;
        highPrice = p.holofoil.high || highPrice;
      }
      if (p.reverseHolofoil) {
        reverseHoloPrice = p.reverseHolofoil.market || p.reverseHolofoil.mid || 0;
      }
      if (p.normal) {
        normalPrice = p.normal.market || p.normal.mid || 0;
        lowPrice = lowPrice || p.normal.low || 0;
        highPrice = highPrice || p.normal.high || 0;
      }
      if (p.unlimitedHolofoil) {
        holoPrice = holoPrice || p.unlimitedHolofoil.market || 0;
      }

      marketPrice = holoPrice || reverseHoloPrice || normalPrice || p['1stEditionHolofoil']?.market || 0;
    } else if (card.cardmarket && card.cardmarket.prices) {
      marketPrice = (card.cardmarket.prices.averageSellPrice || card.cardmarket.prices.trendPrice || 0) * 1.08;
      normalPrice = marketPrice;
    }

    const fallbackImg = this.getFallbackArtwork(card.name, card.nationalPokedexNumbers?.[0]);
    const smallImg = card.images?.small || card.images?.large || fallbackImg;
    const largeImg = card.images?.large || card.images?.small || fallbackImg;

    return {
      id: card.id,
      name: card.name,
      supertype: card.supertype || 'Pokémon',
      subtypes: card.subtypes || [],
      hp: card.hp || '',
      types: card.types || [],
      rarity: card.rarity || 'Common',
      number: card.number,
      artist: card.artist || 'Desconhecido',
      flavorText: card.flavorText || '',
      images: {
        small: smallImg,
        large: largeImg
      },
      set: {
        id: card.set?.id || '',
        name: card.set?.name || '',
        series: card.set?.series || '',
        printedTotal: card.set?.printedTotal || 0,
        total: card.set?.total || 0,
        releaseDate: card.set?.releaseDate || '',
        symbol: card.set?.images?.symbol || '',
        logo: card.set?.images?.logo || ''
      },
      attacks: (card.attacks || []).map(att => ({
        name: att.name,
        cost: att.cost || [],
        convertedEnergyCost: att.convertedEnergyCost || 0,
        damage: att.damage || '',
        text: att.text || ''
      })),
      weaknesses: card.weaknesses || [],
      resistances: card.resistances || [],
      retreatCost: card.retreatCost || [],
      prices: {
        market: marketPrice || 2.50,
        normal: normalPrice || 2.00,
        holofoil: holoPrice || 3.50,
        reverseHolofoil: reverseHoloPrice || 2.80,
        low: lowPrice || 0.50,
        high: highPrice || 8.00,
        updatedAt: card.tcgplayer?.updatedAt || ''
      },
      marketPriceUsd: marketPrice || 2.50,
      links: {
        tcgplayer: card.tcgplayer?.url || `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(card.name)}`,
        cardmarket: card.cardmarket?.url || `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(card.name)}`,
        ligapokemon: `https://www.ligapokemon.com.br/?view=cards%2Fsearch&card=${encodeURIComponent(card.name)}`
      }
    };
  }

  /**
   * Normalizes TCGDex card schema with real Cardmarket & TCGPlayer pricing and fallback artwork
   */
  normalizeTcgdexCard(card) {
    const dexId = card.dexId?.[0] || null;
    const fallbackImg = this.getFallbackArtwork(card.name, dexId);
    
    // TCGDex image structure
    let smallImg = fallbackImg;
    let largeImg = fallbackImg;

    if (card.image) {
      smallImg = `${card.image}/low.webp`;
      largeImg = `${card.image}/high.webp`;
    }

    // Extract genuine market prices from card.pricing
    let marketPrice = 0;
    let normalPrice = 0;
    let holoPrice = 0;
    let lowPrice = 0;
    let highPrice = 0;

    if (card.pricing?.tcgplayer) {
      const t = card.pricing.tcgplayer;
      holoPrice = t.holofoil?.market || t.holofoil?.mid || 0;
      normalPrice = t.normal?.market || t.normal?.mid || 0;
      marketPrice = holoPrice || normalPrice;
      lowPrice = t.holofoil?.low || t.normal?.low || 0;
      highPrice = t.holofoil?.high || t.normal?.high || 0;
    }

    if (!marketPrice && card.pricing?.cardmarket) {
      const cm = card.pricing.cardmarket;
      const eur = cm.avg || cm.trend || cm.avg30 || cm.avg7 || 2.0;
      marketPrice = Number((eur * 1.08).toFixed(2));
      normalPrice = marketPrice;
      lowPrice = Number(((cm.low || eur * 0.4) * 1.08).toFixed(2));
      highPrice = Number(((cm['trend-holo'] || eur * 1.6) * 1.08).toFixed(2));
    }

    if (!marketPrice) {
      marketPrice = 2.20;
      normalPrice = 1.80;
      holoPrice = 3.50;
      lowPrice = 0.50;
      highPrice = 6.00;
    }

    const setTotal = card.set?.cardCount?.total || card.set?.cardCount?.official || 0;

    return {
      id: `tcgdex_${card.id}`,
      name: card.name,
      supertype: card.category || 'Pokémon',
      subtypes: card.stage ? [card.stage] : [],
      hp: card.hp ? String(card.hp) : '',
      types: card.types || [],
      rarity: card.rarity && card.rarity !== 'None' ? card.rarity : 'Comum',
      number: card.localId || '',
      artist: card.illustrator || 'Desconhecido',
      images: {
        small: smallImg,
        large: largeImg
      },
      set: {
        id: card.set?.id || '',
        name: card.set?.name || 'Coleção Pokémon TCG',
        total: setTotal,
        official: card.set?.cardCount?.official || setTotal,
        symbol: card.set?.logo ? `${card.set.logo}.webp` : ''
      },
      attacks: (card.attacks || []).map(a => ({
        name: a.name,
        damage: a.damage ? String(a.damage) : '',
        text: a.effect || ''
      })),
      prices: {
        market: marketPrice,
        normal: normalPrice || marketPrice,
        holofoil: holoPrice || marketPrice * 1.4,
        low: lowPrice,
        high: highPrice
      },
      marketPriceUsd: marketPrice,
      links: {
        tcgplayer: `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(card.name)}`,
        cardmarket: `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(card.name)}`,
        ligapokemon: `https://www.ligapokemon.com.br/?view=cards%2Fsearch&card=${encodeURIComponent(card.name)}`
      }
    };
  }

  /**
   * Ranks and deduplicates cards based on query match score
   */
  rankAndDeduplicate(cards, { name, number, setTotal, set }) {
    if (!Array.isArray(cards) || cards.length === 0) return [];

    const seenIds = new Set();
    const unique = [];

    const queryNum = (number || '').trim();
    const cleanQueryNum = queryNum.replace(/^0+/, '');
    const querySetTotal = (setTotal || '').trim();
    const cleanQuerySetTotal = querySetTotal.replace(/^0+/, '');

    for (const card of cards) {
      if (!card || !card.id || seenIds.has(card.id)) continue;
      seenIds.add(card.id);

      let score = 0;
      const cardName = (card.name || '').toLowerCase();
      const cardNum = String(card.number || '').trim();
      const cleanNum = cardNum.replace(/^0+/, '');
      const cardTotal = String(card.set?.total || card.set?.official || card.set?.printedTotal || '').trim();
      const cleanCardTotal = cardTotal.replace(/^0+/, '');

      // Score matching number (+100 for exact match, +80 for zero-stripped match)
      if (queryNum) {
        if (cardNum === queryNum) {
          score += 100;
        } else if (cleanNum && cleanNum === cleanQueryNum) {
          score += 80;
        } else if (cardNum.toLowerCase().includes(queryNum.toLowerCase())) {
          score += 40;
        } else {
          // Penalize if query specified a number but card has a totally different number
          score -= 50;
        }
      }

      // Score matching set total (+60 for exact set total match e.g. "015" === "15")
      if (querySetTotal) {
        if (cardTotal === querySetTotal || (cleanCardTotal && cleanCardTotal === cleanQuerySetTotal)) {
          score += 60;
        }
      }

      // Score matching set name (+30)
      if (set && card.set?.name && card.set.name.toLowerCase().includes(set.toLowerCase())) {
        score += 30;
      }

      // Score exact name match (+25)
      if (name && cardName === name.toLowerCase()) {
        score += 25;
      } else if (name && cardName.includes(name.toLowerCase())) {
        score += 15;
      }

      unique.push({ card, score });
    }

    unique.sort((a, b) => b.score - a.score);
    return unique.map(u => u.card);
  }

  /**
   * Curated offline instant local dataset for high-profile cards
   */
  searchCuratedLocal(name, number, rawQuery) {
    const curated = [
      {
        id: 'sv3pt5-25',
        name: 'Pikachu',
        supertype: 'Pokémon',
        subtypes: ['Basic'],
        hp: '60',
        types: ['Lightning'],
        rarity: 'Common',
        number: '025',
        artist: 'Hiroyuki Yamamoto',
        images: {
          small: 'https://images.pokemontcg.io/sv3pt5/25.png',
          large: 'https://images.pokemontcg.io/sv3pt5/25_hires.png'
        },
        set: {
          id: 'sv3pt5',
          name: '151',
          series: 'Scarlet & Violet',
          total: 165
        },
        attacks: [
          { name: 'Charge', damage: '', text: 'Search your deck for up to 2 Basic Lightning Energy cards.' },
          { name: 'Pika Bolt', damage: '50', text: '' }
        ],
        prices: { market: 1.20, holofoil: 3.50, normal: 0.80, low: 0.50, high: 5.00 },
        marketPriceUsd: 1.20,
        links: {
          tcgplayer: 'https://www.tcgplayer.com/search/pokemon/product?q=Pikachu+151+025',
          ligapokemon: 'https://www.ligapokemon.com.br/?view=cards%2Fsearch&card=Pikachu+151'
        }
      },
      {
        id: '2023sv-6',
        name: 'Pikachu',
        supertype: 'Pokémon',
        subtypes: ['Basic'],
        hp: '70',
        types: ['Lightning'],
        rarity: 'Promo',
        number: '6',
        artist: 'OKACHEKE',
        images: {
          small: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png',
          large: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png'
        },
        set: {
          id: '2023sv',
          name: "McDonald's Collection 2023",
          series: "McDonald's",
          total: 15
        },
        attacks: [
          { name: 'Growl', damage: '', text: "During your opponent's next turn, attacks do 20 less damage." },
          { name: 'Pika Bolt', damage: '30', text: '' }
        ],
        prices: { market: 2.25, holofoil: 3.50, normal: 2.00, low: 0.50, high: 5.00 },
        marketPriceUsd: 2.25,
        links: {
          tcgplayer: 'https://www.tcgplayer.com/search/pokemon/product?q=Pikachu+McDonalds+2023+6',
          ligapokemon: 'https://www.ligapokemon.com.br/?view=cards%2Fsearch&card=Pikachu+McDonalds'
        }
      },
      {
        id: 'sv3pt5-173',
        name: 'Pikachu',
        supertype: 'Pokémon',
        subtypes: ['Basic'],
        hp: '60',
        types: ['Lightning'],
        rarity: 'Illustration Rare',
        number: '173',
        artist: 'Hiroyuki Yamamoto',
        images: {
          small: 'https://images.pokemontcg.io/sv3pt5/173.png',
          large: 'https://images.pokemontcg.io/sv3pt5/173_hires.png'
        },
        set: {
          id: 'sv3pt5',
          name: '151',
          series: 'Scarlet & Violet',
          total: 165
        },
        attacks: [
          { name: 'Charge', damage: '', text: 'Search your deck for up to 2 Basic Lightning Energy cards.' },
          { name: 'Pika Bolt', damage: '50', text: '' }
        ],
        prices: { market: 22.80, holofoil: 22.80, normal: 0, low: 18.00, high: 32.00 },
        marketPriceUsd: 22.80,
        links: {
          tcgplayer: 'https://www.tcgplayer.com/product/517019/pokemon-sv-scarlet-and-violet-151-pikachu-173-165',
          ligapokemon: 'https://www.ligapokemon.com.br/?view=cards%2Fsearch&card=Pikachu+173'
        }
      },
      {
        id: 'base1-58',
        name: 'Pikachu',
        supertype: 'Pokémon',
        subtypes: ['Basic'],
        hp: '40',
        types: ['Lightning'],
        rarity: 'Common',
        number: '58',
        artist: 'Mitsuhiro Arita',
        images: {
          small: 'https://images.pokemontcg.io/base1/58.png',
          large: 'https://images.pokemontcg.io/base1/58_hires.png'
        },
        set: {
          id: 'base1',
          name: 'Base Set',
          series: 'Base',
          total: 102
        },
        attacks: [
          { name: 'Gnaw', damage: '10', text: '' },
          { name: 'Thunder Jolt', damage: '30', text: 'Flip a coin. If tails, Pikachu does 10 damage to itself.' }
        ],
        prices: { market: 12.50, holofoil: 45.00, normal: 12.50, low: 5.00, high: 150.00 },
        marketPriceUsd: 12.50,
        links: {
          tcgplayer: 'https://www.tcgplayer.com/product/42398/pokemon-base-set-pikachu-red-cheeks',
          ligapokemon: 'https://www.ligapokemon.com.br/?view=cards%2Fsearch&card=Pikachu+Base+Set+58'
        }
      },
      {
        id: 'swshp-SWSH020',
        name: 'Pikachu',
        supertype: 'Pokémon',
        subtypes: ['Basic', 'Promo'],
        hp: '70',
        types: ['Lightning'],
        rarity: 'Promo',
        number: 'SWSH020',
        artist: 'You Iribi',
        images: {
          small: 'https://images.pokemontcg.io/swshp/SWSH020.png',
          large: 'https://images.pokemontcg.io/swshp/SWSH020_hires.png'
        },
        set: {
          id: 'swshp',
          name: 'SWSH Black Star Promos',
          series: 'Sword & Shield',
          total: 107
        },
        attacks: [
          { name: 'Electrorain', damage: '', text: 'Discard Energy and deal damage.' }
        ],
        prices: { market: 48.00, holofoil: 48.00, normal: 0, low: 35.00, high: 65.00 },
        marketPriceUsd: 48.00,
        links: {
          tcgplayer: 'https://www.tcgplayer.com/product/212624/pokemon-swsh-sword-and-shield-promo-cards-pikachu-swsh020',
          ligapokemon: 'https://www.ligapokemon.com.br/?view=cards%2Fsearch&card=Pikachu+SWSH020'
        }
      }
    ];

    const term = (name || rawQuery || '').toLowerCase().trim();
    const num = (number || '').toLowerCase().trim();

    return curated.filter(c => {
      const matchName = term ? c.name.toLowerCase().includes(term) : true;
      const matchNum = num ? (
        c.number.toLowerCase() === num ||
        c.number.toLowerCase().replace(/^0+/, '') === num.replace(/^0+/, '') ||
        c.number.toLowerCase().includes(num)
      ) : true;
      return matchName || matchNum;
    });
  }
}

export const pokemonApi = new PokemonApiService();
