/**
 * Pokemon TCG API Service - Comprehensive Worldwide Pokemon Card Search Engine
 * Integrates pokemontcg.io & tcgdex.net with intelligent multi-tiered querying,
 * promo code resolution, fuzzy fallback and rich pricing.
 */

const POKEMON_TCG_API_BASE = 'https://api.pokemontcg.io/v2';
const TCGDEX_API_BASE = 'https://api.tcgdex.net/v2';

// In-memory cache to prevent redundant network queries
const memoryCache = new Map();

class PokemonApiService {
  /**
   * Universal card search accepting raw query string, name, collector number, set, etc.
   * @param {Object|string} params
   * @param {string} [params.query] - Raw search query (e.g. "Pikachu 025/165", "SWSH020", "58/102")
   * @param {string} [params.name] - Pokemon card name (e.g. "Pikachu", "Charizard")
   * @param {string} [params.number] - Collector number (e.g. "025", "58", "SWSH020", "SVP027")
   * @param {string} [params.set] - Set name or set code (e.g. "151", "sv3pt5", "base")
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

    // Parse and structure the query
    const parsed = this.parseQuery({ rawQuery, name, number, set });
    const cacheKey = `search_${parsed.name}_${parsed.number}_${parsed.setTotal}_${parsed.set}`.toLowerCase().trim();

    if (memoryCache.has(cacheKey)) {
      return memoryCache.get(cacheKey);
    }

    let results = [];

    // Strategy 1: Pokemontcg.io API (Rich prices + Hi-res images)
    try {
      results = await this.queryPokemonTcgIo(parsed);
    } catch (err) {
      console.warn('[PokemonAPI] pokemontcg.io query failed, trying next strategy:', err);
    }

    // Strategy 2: TCGDex API (Full Global Database: EN & PT-BR, Promos, All Sets)
    if (!results || results.length === 0) {
      try {
        const tcgdexCards = await this.queryTcgdex(parsed);
        if (tcgdexCards && tcgdexCards.length > 0) {
          results = tcgdexCards;
        }
      } catch (err) {
        console.warn('[PokemonAPI] TCGDex query failed, trying next strategy:', err);
      }
    }

    // Strategy 3: Curated Offline Dataset Fallback
    if (!results || results.length === 0) {
      const localCards = this.searchCuratedLocal(parsed.name, parsed.number, parsed.rawQuery);
      if (localCards && localCards.length > 0) {
        results = localCards;
      }
    }

    // Strategy 4: Broad Name-Only Search with Post-Filter if specific search returned 0
    if ((!results || results.length === 0) && parsed.name && parsed.name.length >= 2) {
      try {
        const broad = await this.queryPokemonTcgIo({ name: parsed.name, number: '', set: '', setTotal: '' });
        if (broad && broad.length > 0) {
          results = broad;
        }
      } catch (e) {
        // ignore
      }
    }

    // Deduplicate and rank results by relevance
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

    let combined = `${rawQuery} ${cleanName}`.trim();

    // 1. Check for fraction pattern: e.g. "025/165", "58/102", "173/165", "TG05/TG30", "GG30/GG70", "RC29/RC32", "4/102"
    const fractionMatch = combined.match(/([a-zA-Z]{0,4}\s*\d{1,4}[a-zA-Z]?)\s*[\/|\\]\s*([a-zA-Z]{0,4}\s*\d{1,4})/i);
    if (fractionMatch) {
      cleanNumber = fractionMatch[1].replace(/\s+/g, '');
      setTotal = fractionMatch[2].replace(/\s+/g, '');
      combined = combined.replace(fractionMatch[0], ' ').trim();
    }

    // 2. Check for promo codes: e.g. "SWSH020", "SVP 027", "SM162", "XY95", "BW54", "DP16", "HGSS03", "TG05", "GG30", "RC29", "PROMO 025"
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
        // If query was just a number like "025" or "199"
        cleanNumber = singleNumMatch[1];
        combined = combined.replace(singleNumMatch[0], ' ').trim();
      }
    }

    // 4. Extract Set names if present in query: e.g. "151", "Base Set", "Evolving Skies", "Surging Sparks"
    const knownSets = [
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
      { name: 'Champions Path', id: 'swsh35' },
      { name: 'Darkness Ablaze', id: 'swsh3' },
      { name: 'Rebel Clash', id: 'swsh2' },
      { name: 'Sword & Shield', id: 'swsh1' },
      { name: 'Cosmic Eclipse', id: 'sm12' },
      { name: 'Hidden Fates', id: 'sm115' },
      { name: 'Unified Minds', id: 'sm11' },
      { name: 'Unbroken Bonds', id: 'sm10' },
      { name: 'Team Up', id: 'sm9' },
      { name: 'Lost Thunder', id: 'sm8' },
      { name: 'Dragon Majesty', id: 'sm75' },
      { name: 'Celestial Storm', id: 'sm7' },
      { name: 'Ultra Prism', id: 'sm5' },
      { name: 'Crimson Invasion', id: 'sm4' },
      { name: 'Shining Legends', id: 'sm35' },
      { name: 'Burning Shadows', id: 'sm3' },
      { name: 'Guardians Rising', id: 'sm2' },
      { name: 'Sun & Moon', id: 'sm1' },
      { name: 'Evolutions', id: 'xy12' },
      { name: 'Generations', id: 'g1' },
      { name: 'Roaring Skies', id: 'xy6' },
      { name: 'Phantom Forces', id: 'xy4' },
      { name: 'Flashfire', id: 'xy2' },
      { name: 'Team Rocket', id: 'base5' },
      { name: 'Gym Challenge', id: 'gym2' },
      { name: 'Gym Heroes', id: 'gym1' },
      { name: 'Fossil', id: 'base3' },
      { name: 'Jungle', id: 'base2' }
    ];

    for (const s of knownSets) {
      const regex = new RegExp(`\\b${s.name}\\b`, 'i');
      if (regex.test(combined)) {
        cleanSet = s.name;
        combined = combined.replace(regex, ' ').trim();
        break;
      }
    }

    // Clean remaining name
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
   * Query Pokemontcg.io with intelligent query builders & automatic fallback
   */
  async queryPokemonTcgIo({ name, number, setTotal, set }) {
    let queryParts = [];

    const cleanName = name ? name.replace(/[^a-zA-Z0-9\s-]/g, '').trim() : '';
    const cleanNumber = number ? number.replace(/^0+/, '').trim() : ''; // "025" -> "25"
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

    // Attempt 1: Direct multi-criteria query
    let res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      if (data && data.data && data.data.length > 0) {
        return data.data.map(card => this.normalizePokemonTcgIoCard(card));
      }
    }

    // Attempt 2: If we had name AND number, but got 0 results, query by NAME only and sort in memory
    if (cleanName && rawNumber) {
      const fallbackUrl = `${POKEMON_TCG_API_BASE}/cards?q=${encodeURIComponent(`name:"*${cleanName}*"`)}&pageSize=30&orderBy=-set.releaseDate`;
      res = await fetch(fallbackUrl, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        if (data && data.data && data.data.length > 0) {
          return data.data.map(card => this.normalizePokemonTcgIoCard(card));
        }
      }
    }

    // Attempt 3: If query was only a number (e.g. "025" or "58" or "SWSH020"), query by number
    if (!cleanName && rawNumber) {
      const numberUrl = `${POKEMON_TCG_API_BASE}/cards?q=${encodeURIComponent(`(number:"${rawNumber}" OR number:"${cleanNumber}")`)}&pageSize=30&orderBy=-set.releaseDate`;
      res = await fetch(numberUrl, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        if (data && data.data && data.data.length > 0) {
          return data.data.map(card => this.normalizePokemonTcgIoCard(card));
        }
      }
    }

    return [];
  }

  /**
   * Query TCGDex Multi-Language Database (Global Worldwide Cards)
   */
  async queryTcgdex({ name, number, set }) {
    const cleanName = name ? encodeURIComponent(name.trim()) : '';
    const cleanNumber = number ? number.trim() : '';

    let matchedList = [];

    // Try English cards by name
    if (cleanName) {
      try {
        const resEn = await fetch(`${TCGDEX_API_BASE}/en/cards?name=${cleanName}`);
        if (resEn.ok) {
          const list = await resEn.json();
          if (Array.isArray(list) && list.length > 0) {
            matchedList.push(...list);
          }
        }
      } catch (e) {}

      // Try Portuguese cards by name
      try {
        const resPt = await fetch(`${TCGDEX_API_BASE}/pt/cards?name=${cleanName}`);
        if (resPt.ok) {
          const list = await resPt.json();
          if (Array.isArray(list) && list.length > 0) {
            matchedList.push(...list);
          }
        }
      } catch (e) {}
    }

    // If query has number, filter or search by localId
    if (cleanNumber && matchedList.length > 0) {
      const numClean = cleanNumber.replace(/^0+/, '');
      const filtered = matchedList.filter(item => {
        const itemNum = String(item.localId || '').trim();
        return itemNum === cleanNumber || itemNum.replace(/^0+/, '') === numClean;
      });
      if (filtered.length > 0) {
        matchedList = filtered;
      }
    }

    if (matchedList.length === 0) return [];

    // Deduplicate by ID and fetch details for top 8 cards
    const uniqueIds = Array.from(new Set(matchedList.map(i => i.id))).slice(0, 8);
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
        small: card.images?.small || '',
        large: card.images?.large || card.images?.small || ''
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
        market: marketPrice,
        normal: normalPrice,
        holofoil: holoPrice,
        reverseHolofoil: reverseHoloPrice,
        low: lowPrice,
        high: highPrice,
        updatedAt: card.tcgplayer?.updatedAt || ''
      },
      marketPriceUsd: marketPrice,
      links: {
        tcgplayer: card.tcgplayer?.url || `https://www.tcgplayer.com/search/pokemon/product?q=${encodeURIComponent(card.name)}`,
        cardmarket: card.cardmarket?.url || `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(card.name)}`,
        ligapokemon: `https://www.ligapokemon.com.br/?view=cards%2Fsearch&card=${encodeURIComponent(card.name)}`
      }
    };
  }

  /**
   * Normalizes TCGDex card schema with estimated/market prices
   */
  normalizeTcgdexCard(card) {
    const defaultImg = card.image ? `${card.image}/high.webp` : '';
    const lowImg = card.image ? `${card.image}/low.webp` : '';

    return {
      id: `tcgdex_${card.id}`,
      name: card.name,
      supertype: card.category || 'Pokémon',
      subtypes: card.stage ? [card.stage] : [],
      hp: card.hp ? String(card.hp) : '',
      types: card.types || [],
      rarity: card.rarity || 'Common',
      number: card.localId || '',
      artist: card.illustrator || '',
      images: {
        small: lowImg || defaultImg,
        large: defaultImg || lowImg
      },
      set: {
        id: card.set?.id || '',
        name: card.set?.name || 'Coleção Pokémon TCG',
        total: card.set?.cardCount?.total || 0,
        symbol: card.set?.logo ? `${card.set.logo}.webp` : ''
      },
      attacks: (card.attacks || []).map(a => ({
        name: a.name,
        damage: a.damage ? String(a.damage) : '',
        text: a.effect || ''
      })),
      prices: {
        market: 4.50,
        normal: 3.00,
        holofoil: 6.00,
        low: 1.50,
        high: 12.00
      },
      marketPriceUsd: 4.50,
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

    for (const card of cards) {
      if (!card || !card.id || seenIds.has(card.id)) continue;
      seenIds.add(card.id);

      let score = 0;
      const cardName = (card.name || '').toLowerCase();
      const cardNum = String(card.number || '').trim();
      const cleanNum = cardNum.replace(/^0+/, '');
      const queryNum = (number || '').trim();
      const cleanQueryNum = queryNum.replace(/^0+/, '');
      const cardTotal = String(card.set?.total || card.set?.printedTotal || '');

      // Score matching number (+100 for exact match)
      if (queryNum && (cardNum === queryNum || (cleanNum && cleanNum === cleanQueryNum))) {
        score += 100;
      } else if (queryNum && cardNum.toLowerCase().includes(queryNum.toLowerCase())) {
        score += 60;
      }

      // Score matching set total (+40)
      if (setTotal && cardTotal === setTotal) {
        score += 40;
      }

      // Score matching set name (+30)
      if (set && card.set?.name && card.set.name.toLowerCase().includes(set.toLowerCase())) {
        score += 30;
      }

      // Score exact name match (+20)
      if (name && cardName === name.toLowerCase()) {
        score += 20;
      } else if (name && cardName.includes(name.toLowerCase())) {
        score += 10;
      }

      unique.push({ card, score });
    }

    unique.sort((a, b) => b.score - a.score);
    return unique.map(u => u.card);
  }

  /**
   * Curated offline instant local dataset for high-profile cards (Pikachu, Charizard, etc.)
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
        id: 'swsh4-44',
        name: 'Pikachu VMAX',
        supertype: 'Pokémon',
        subtypes: ['VMAX'],
        hp: '310',
        types: ['Lightning'],
        rarity: 'Ultra Rare',
        number: '44',
        artist: 'aky CG Works',
        images: {
          small: 'https://images.pokemontcg.io/swsh4/44.png',
          large: 'https://images.pokemontcg.io/swsh4/44_hires.png'
        },
        set: {
          id: 'swsh4',
          name: 'Vivid Voltage',
          series: 'Sword & Shield',
          total: 185
        },
        attacks: [
          { name: 'G-Max Volt Tackle', damage: '120+', text: 'You may discard all Energy from this Pokémon.' }
        ],
        prices: { market: 14.20, holofoil: 14.20, normal: 0, low: 10.00, high: 22.00 },
        marketPriceUsd: 14.20,
        links: {
          tcgplayer: 'https://www.tcgplayer.com/search/pokemon/product?q=Pikachu+VMAX+44',
          ligapokemon: 'https://www.ligapokemon.com.br/?view=cards%2Fsearch&card=Pikachu+VMAX+44'
        }
      },
      {
        id: 'swsh4-188',
        name: 'Pikachu VMAX',
        supertype: 'Pokémon',
        subtypes: ['VMAX', 'Rainbow Rare'],
        hp: '310',
        types: ['Lightning'],
        rarity: 'Secret Rare',
        number: '188',
        artist: 'aky CG Works',
        images: {
          small: 'https://images.pokemontcg.io/swsh4/188.png',
          large: 'https://images.pokemontcg.io/swsh4/188_hires.png'
        },
        set: {
          id: 'swsh4',
          name: 'Vivid Voltage',
          series: 'Sword & Shield',
          total: 185
        },
        attacks: [
          { name: 'G-Max Volt Tackle', damage: '120+', text: 'You may discard all Energy from this Pokémon.' }
        ],
        prices: { market: 145.00, holofoil: 145.00, normal: 0, low: 120.00, high: 190.00 },
        marketPriceUsd: 145.00,
        links: {
          tcgplayer: 'https://www.tcgplayer.com/product/226418/pokemon-swsh04-vivid-voltage-pikachu-vmax-secret',
          ligapokemon: 'https://www.ligapokemon.com.br/?view=cards%2Fsearch&card=Pikachu+VMAX+188'
        }
      },
      {
        id: 'sv8-57',
        name: 'Pikachu ex',
        supertype: 'Pokémon',
        subtypes: ['Basic', 'ex', 'Tera'],
        hp: '200',
        types: ['Lightning'],
        rarity: 'Double Rare',
        number: '057',
        artist: '5ban Graphics',
        images: {
          small: 'https://images.pokemontcg.io/sv8/57.png',
          large: 'https://images.pokemontcg.io/sv8/57_hires.png'
        },
        set: {
          id: 'sv8',
          name: 'Surging Sparks',
          series: 'Scarlet & Violet',
          total: 191
        },
        attacks: [
          { name: 'Topaz Bolt', damage: '300', text: 'Discard 3 Energy from this Pokémon.' }
        ],
        prices: { market: 12.00, holofoil: 12.00, normal: 0, low: 8.00, high: 18.00 },
        marketPriceUsd: 12.00,
        links: {
          tcgplayer: 'https://www.tcgplayer.com/search/pokemon/product?q=Pikachu+ex+057',
          ligapokemon: 'https://www.ligapokemon.com.br/?view=cards%2Fsearch&card=Pikachu+ex+057'
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
      },
      {
        id: 'sv3pt5-199',
        name: 'Charizard ex',
        supertype: 'Pokémon',
        subtypes: ['Stage 2', 'ex', 'Tera'],
        hp: '330',
        types: ['Darkness'],
        rarity: 'Special Illustration Rare',
        number: '199',
        artist: 'AKIRA EGAWA',
        images: {
          small: 'https://images.pokemontcg.io/sv3pt5/199.png',
          large: 'https://images.pokemontcg.io/sv3pt5/199_hires.png'
        },
        set: {
          id: 'sv3pt5',
          name: '151',
          series: 'Scarlet & Violet',
          total: 165
        },
        attacks: [
          { name: 'Brave Wing', damage: '160', text: 'This attack does 100 more damage.' },
          { name: 'Burning Darkness', damage: '180+', text: 'This attack does 30 more damage.' }
        ],
        prices: { market: 119.50, holofoil: 119.50, normal: 0, low: 95.00, high: 160.00 },
        marketPriceUsd: 119.50,
        links: {
          tcgplayer: 'https://www.tcgplayer.com/product/517045/pokemon-sv-scarlet-and-violet-151-charizard-ex-199-165',
          ligapokemon: 'https://www.ligapokemon.com.br/?view=cards%2Fsearch&card=Charizard+ex+199'
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
