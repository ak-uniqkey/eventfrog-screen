const axios = require('axios');

const ORGANIZER_BASE = 'https://api.eventfrog.net/organizer/v1';

function buildHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
    Accept: 'application/json',
  };
}

function formatApiError(err) {
  if (err.response?.data) {
    const d = err.response.data;
    const detail = d.detail || d.title || d.message;
    if (detail) return `${err.response.status}: ${detail}`;
  }
  return err.message || 'Eventfrog API Fehler';
}

async function organizerGet(apiKey, resourcePath) {
  try {
    const response = await axios.get(`${ORGANIZER_BASE}${resourcePath}`, {
      headers: buildHeaders(apiKey),
      timeout: 15000,
    });
    return response.data;
  } catch (err) {
    const message = formatApiError(err);
    const error = new Error(message);
    error.status = err.response?.status;
    throw error;
  }
}

async function getEvent(apiKey, eventId) {
  return organizerGet(apiKey, `/events/${encodeURIComponent(eventId)}`);
}

async function getEventCategories(apiKey, eventId) {
  return organizerGet(apiKey, `/events/${encodeURIComponent(eventId)}/ticketcategories`);
}

function pickLocalizedInfo(cat) {
  const list = cat.localizedInfo || [];
  return list.find((l) => l.locale && String(l.locale).startsWith('de')) || list[0] || {};
}

function extractPriceCents(cat) {
  const loc = pickLocalizedInfo(cat);
  const ps = cat.priceStrategy;
  if (ps) {
    if (ps.type === 'early_bird' && ps.earlyBird) {
      const stages = ps.earlyBird.stages || [];
      if (stages.length > 0 && stages[0].price != null) return stages[0].price;
      if (ps.earlyBird.regularPrice != null) return ps.earlyBird.regularPrice;
    }
    if (ps.fixed?.price != null) return ps.fixed.price;
    if (ps.price != null) return ps.price;
  }
  return undefined;
}

function extractAvailable(cat) {
  const explicit = [
    cat.remainingNumberOfTickets,
    cat.availableNumberOfTickets,
    cat.numberOfRemainingTickets,
    cat.available_capacity,
    cat.availableCapacity,
  ];
  for (const v of explicit) {
    if (v !== undefined && v !== null) return v;
  }

  const total = cat.totalNumberOfTickets;
  const sold = cat.numberOfSoldTickets ?? cat.soldTickets ?? cat.sold;
  if (total !== undefined && sold !== undefined) {
    return Math.max(0, total - sold);
  }

  // Organizer-API liefert oft nur Gesamtkontingent (kein Verkaufsstand)
  if (total !== undefined) return total;
  return undefined;
}

function mapEventfrogCategory(cat) {
  const loc = pickLocalizedInfo(cat);
  return {
    name: loc.title || 'Kategorie',
    available_capacity: extractAvailable(cat),
    price: extractPriceCents(cat),
    priceText: loc.priceText || null,
  };
}

function parseCategories(data) {
  if (!data) return [];

  // Eventfrog Organizer API: { totalNumberOfResources, data: [...] }
  if (Array.isArray(data.data) && data.data.length > 0) {
    return data.data.filter((c) => c && typeof c === 'object');
  }

  if (Array.isArray(data)) return data;

  const directPaths = [
    data.ticketCategories,
    data.ticketcategories,
    data.categories,
    data.items,
    data.datasets,
    data.content,
    data.results,
  ];

  for (const candidate of directPaths) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate;
    }
  }

  return [];
}

function normalizeCategories(list) {
  return list.map(mapEventfrogCategory);
}

async function fetchCategoriesForEvent(apiKey, eventId) {
  const ticketData = await getEventCategories(apiKey, eventId);
  let rawList = parseCategories(ticketData);

  if (rawList.length === 0) {
    try {
      const eventData = await getEvent(apiKey, eventId);
      rawList = parseCategories(eventData);
    } catch {
      /* optional */
    }
  }

  return {
    categories: normalizeCategories(rawList),
    raw: ticketData,
  };
}

module.exports = {
  getEvent,
  getEventCategories,
  fetchCategoriesForEvent,
  parseCategories,
  normalizeCategories,
  mapEventfrogCategory,
  formatApiError,
};
