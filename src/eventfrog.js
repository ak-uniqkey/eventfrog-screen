const axios = require('axios');

const BASE_URL = 'https://api.eventfrog.net/api/v1';

async function getEvent(apiKey, eventId) {
  const response = await axios.get(`${BASE_URL}/events/${eventId}`, {
    params: { apikey: apiKey },
    timeout: 10000,
  });
  return response.data;
}

async function getEventCategories(apiKey, eventId) {
  const response = await axios.get(`${BASE_URL}/events/${eventId}/ticketcategories`, {
    params: { apikey: apiKey },
    timeout: 10000,
  });
  return response.data;
}

module.exports = { getEvent, getEventCategories };
