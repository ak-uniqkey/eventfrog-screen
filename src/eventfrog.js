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

async function getTicketTransactionsPage(apiKey, eventId, page = 1, perPage = 100) {
  const q = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
  });
  return organizerGet(
    apiKey,
    `/events/${encodeURIComponent(eventId)}/tickettransactions?${q.toString()}`
  );
}

async function getAllTicketTransactions(apiKey, eventId) {
  const perPage = 100;
  let page = 1;
  const transactions = [];
  let total = Infinity;

  while (transactions.length < total) {
    const data = await getTicketTransactionsPage(apiKey, eventId, page, perPage);
    const batch = Array.isArray(data.data) ? data.data : [];
    transactions.push(...batch);
    total = typeof data.totalNumberOfResources === 'number'
      ? data.totalNumberOfResources
      : transactions.length;
    if (batch.length === 0 || batch.length < perPage) break;
    page += 1;
  }

  return transactions;
}

function countActiveTicketsByCategory(transactions) {
  const counts = {};
  for (const tx of transactions) {
    for (const ticket of tx.tickets || []) {
      if (ticket.cancelled) continue;
      const categoryId = ticket.categoryId;
      if (categoryId === undefined || categoryId === null) continue;
      counts[categoryId] = (counts[categoryId] || 0) + 1;
    }
  }
  return counts;
}

function pickLocalizedInfo(entity) {
  const list = entity?.localizedInfo || [];
  return list.find((l) => l.locale && String(l.locale).startsWith('de')) || list[0] || {};
}

const DEFAULT_TIME_ZONE = 'Europe/Zurich';

function calendarDayKey(iso, timeZone = DEFAULT_TIME_ZONE) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!y || !m || !day) return null;
  return `${y}-${m}-${day}`;
}

function todayCalendarKey(timeZone = DEFAULT_TIME_ZONE) {
  return calendarDayKey(new Date().toISOString(), timeZone);
}

function isEventPast(event) {
  const tz = event?.timeZone || DEFAULT_TIME_ZONE;
  const endKey = calendarDayKey(event?.endDate || event?.beginDate, tz);
  const todayKey = todayCalendarKey(tz);
  if (!endKey || !todayKey) return false;
  return todayKey > endKey;
}

function isEventToday(event) {
  const tz = event?.timeZone || DEFAULT_TIME_ZONE;
  const beginKey = calendarDayKey(event?.beginDate, tz);
  const endKey = calendarDayKey(event?.endDate || event?.beginDate, tz);
  const todayKey = todayCalendarKey(tz);
  if (!beginKey || !endKey || !todayKey) return false;
  return todayKey >= beginKey && todayKey <= endKey;
}

function formatEventDateLabel(beginDate, timeZone = DEFAULT_TIME_ZONE) {
  if (!beginDate) return null;
  const d = new Date(beginDate);
  if (Number.isNaN(d.getTime())) return null;
  const weekday = d.toLocaleDateString('de-CH', { weekday: 'long', timeZone });
  const day = d.toLocaleDateString('de-CH', { day: '2-digit', timeZone });
  const month = d.toLocaleDateString('de-CH', { month: 'long', timeZone });
  const year = d.toLocaleDateString('de-CH', { year: 'numeric', timeZone });
  return `${weekday}, ${day}. ${month} ${year}`;
}

function buildBookingUrl(event) {
  const id = event?.id;
  if (!id) return null;
  const country = String(event.platformCountry || 'CH').toUpperCase();
  if (country === 'DE') {
    return `https://www.eventfrog.de/de/event.html?vnr=${encodeURIComponent(id)}`;
  }
  return `https://www.eventfrog.ch/de/event.html?vnr=${encodeURIComponent(id)}`;
}

function mapEventSummary(event) {
  const loc = pickLocalizedInfo(event);
  const tz = event?.timeZone || DEFAULT_TIME_ZONE;
  return {
    id: event?.id,
    title: loc.title || null,
    beginDate: event?.beginDate || null,
    endDate: event?.endDate || event?.beginDate || null,
    timeZone: tz,
    dateLabel: formatEventDateLabel(event?.beginDate, tz),
    isToday: isEventToday(event),
    isPast: isEventPast(event),
    bookingUrl: buildBookingUrl(event),
  };
}

function parseApiDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isPriceStageActive(stage, now = new Date()) {
  const validFrom = parseApiDate(stage.validFrom);
  const validUntil = parseApiDate(stage.validUntil);
  if (validFrom && now < validFrom) return false;
  if (validUntil && now >= validUntil) return false;
  return true;
}

function extractPriceCents(cat) {
  const ps = cat.priceStrategy;
  if (!ps) return undefined;

  const now = new Date();

  if (ps.type === 'early_bird' && ps.earlyBird) {
    const eb = ps.earlyBird;
    const stages = (eb.stages || []).filter((s) => s.price != null);
    const activeStage = stages.find((s) => isPriceStageActive(s, now));
    if (activeStage) return activeStage.price;
    if (eb.regularPrice != null) return eb.regularPrice;
  }

  if (ps.type === 'fixed' && ps.fixed?.price != null) return ps.fixed.price;
  if (ps.price != null) return ps.price;
  return undefined;
}

function extractAvailable(cat, soldByCategory = null) {
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

  if (soldByCategory && cat.id != null && total !== undefined) {
    const allocated = soldByCategory[cat.id];
    if (allocated !== undefined) {
      return Math.max(0, total - allocated);
    }
  }

  return undefined;
}

function extractTotalCapacity(cat) {
  const v = cat.totalNumberOfTickets ?? cat.totalCapacity ?? cat.capacity;
  return v !== undefined && v !== null ? v : undefined;
}

function mapEventfrogCategory(cat, soldByCategory = null) {
  const loc = pickLocalizedInfo(cat);
  const price = extractPriceCents(cat);
  const total = extractTotalCapacity(cat);
  const allocated = (soldByCategory && cat.id != null)
    ? soldByCategory[cat.id]
    : undefined;
  return {
    id: cat.id,
    name: loc.title || 'Kategorie',
    available_capacity: extractAvailable(cat, soldByCategory),
    total_capacity: total,
    sold_count: allocated,
    price,
    // priceText oft veraltet (z. B. „18 / 20 €“) — nur ohne berechneten Preis nutzen
    priceText: price != null ? null : (loc.priceText || null),
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

function normalizeCategories(list, soldByCategory = null) {
  return list.map((cat) => mapEventfrogCategory(cat, soldByCategory));
}

async function fetchSoldByCategory(apiKey, eventId) {
  try {
    const transactions = await getAllTicketTransactions(apiKey, eventId);
    return countActiveTicketsByCategory(transactions);
  } catch (err) {
    console.warn('eventfrog tickettransactions:', err.message);
    return null;
  }
}

async function fetchCategoriesForEvent(apiKey, eventId) {
  const [ticketData, soldByCategory] = await Promise.all([
    getEventCategories(apiKey, eventId),
    fetchSoldByCategory(apiKey, eventId),
  ]);
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
    categories: normalizeCategories(rawList, soldByCategory),
    raw: ticketData,
    sold_by_category: soldByCategory,
  };
}

module.exports = {
  getEvent,
  getEventCategories,
  getAllTicketTransactions,
  countActiveTicketsByCategory,
  fetchCategoriesForEvent,
  parseCategories,
  normalizeCategories,
  mapEventfrogCategory,
  mapEventSummary,
  formatEventDateLabel,
  isEventPast,
  isEventToday,
  buildBookingUrl,
  formatApiError,
};
