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

function parseCategories(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  const candidates = [
    data.ticketCategories,
    data.ticketcategories,
    data.categories,
    data.items,
    data.data?.ticketCategories,
    data.data?.ticketcategories,
    data.data?.categories,
    data.event?.ticketCategories,
    data.event?.ticketcategories,
  ];
  for (const list of candidates) {
    if (Array.isArray(list)) return list;
  }
  return [];
}

module.exports = {
  getEvent,
  getEventCategories,
  parseCategories,
  formatApiError,
};
