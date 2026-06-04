(function() {
  let currentIndex = 0;
  let slideTimer = null;
  let refreshTimer = null;
  let currentScreen = null;
  let renderToken = 0;
  let goToToken = 0;

  const refreshSeconds = Math.max(30, parseInt(SETTINGS.refresh_interval, 10) || 30);

  const clientCacheTtlMs = 55000;
  const eventSummaryCache = new Map();
  const categoriesCache = new Map();
  const barcodeCache = new Map();

  function readClientCache(map, key) {
    const entry = map.get(key);
    if (!entry || Date.now() - entry.at > clientCacheTtlMs) return null;
    return entry.data;
  }

  function writeClientCache(map, key, data) {
    map.set(key, { at: Date.now(), data });
  }

  function formatClock() {
    return new Date().toLocaleTimeString('de-CH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function initLayout() {
    const header = document.getElementById('site-header');
    const footer = document.getElementById('site-footer');
    const logoEl = document.getElementById('header-logo');
    const titleEl = document.getElementById('header-title');
    const clockEl = document.getElementById('header-clock');
    const footerWrap = document.getElementById('footer-logos');

    if (SETTINGS.header_enabled) {
      header.classList.remove('hidden');
      header.setAttribute('aria-hidden', 'false');
      if (SETTINGS.header_logo) {
        logoEl.src = SETTINGS.header_logo;
        logoEl.alt = 'Logo';
        logoEl.classList.remove('hidden');
      } else {
        logoEl.removeAttribute('src');
        logoEl.classList.add('hidden');
      }
      titleEl.textContent = SETTINGS.header_title || '';
      titleEl.style.display = SETTINGS.header_title ? '' : 'none';
      clockEl.textContent = formatClock();
    } else {
      header.classList.add('hidden');
      header.setAttribute('aria-hidden', 'true');
    }

    if (SETTINGS.footer_enabled) {
      const logos = Array.isArray(SETTINGS.footer_logos) ? SETTINGS.footer_logos : [];
      if (logos.length > 0) {
        footer.classList.remove('hidden');
        footer.setAttribute('aria-hidden', 'false');
        footerWrap.innerHTML = logos.map(src =>
          `<img src="${src}" alt="" class="footer-logo" />`
        ).join('');
      } else {
        footer.classList.add('hidden');
        footer.setAttribute('aria-hidden', 'true');
        footerWrap.innerHTML = '';
      }
    } else {
      footer.classList.add('hidden');
      footer.setAttribute('aria-hidden', 'true');
      footerWrap.innerHTML = '';
    }

    if (SETTINGS.show_title) {
      document.title = SETTINGS.show_title;
    }
  }

  let lastLayoutSnapshot = '';

  function layoutSnapshot() {
    return JSON.stringify({
      show_title: SETTINGS.show_title,
      refresh_interval: SETTINGS.refresh_interval,
      header_enabled: SETTINGS.header_enabled,
      header_title: SETTINGS.header_title,
      header_logo: SETTINGS.header_logo,
      footer_enabled: SETTINGS.footer_enabled,
      footer_logos: SETTINGS.footer_logos,
      ticker_enabled: SETTINGS.ticker_enabled,
      ticker_texts: SETTINGS.ticker_texts,
    });
  }

  function parseTickerTexts(raw) {
    return String(raw || '')
      .split(/\s*\*\*\*\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function buildTickerMarqueeHtml(parts) {
    const segment = parts.map((t) =>
      `<span class="ticker-item">${escapeHtml(t)}</span>`
    ).join('<span class="ticker-sep" aria-hidden="true"> *** </span>');
    const duration = Math.max(18, Math.min(90, parts.join('').length * 0.35));
    return `
      <div class="ticker-marquee" style="--ticker-duration: ${duration}s">
        <div class="ticker-marquee-track">
          <div class="ticker-marquee-content">${segment}</div>
          <div class="ticker-marquee-content" aria-hidden="true">${segment}</div>
        </div>
      </div>`;
  }

  function updateSiteTicker() {
    const el = document.getElementById('site-ticker');
    const root = document.getElementById('slideshow');
    if (!el || !root) return;

    const enabled = SETTINGS.ticker_enabled;
    const parts = parseTickerTexts(SETTINGS.ticker_texts);
    if (!enabled || parts.length === 0) {
      el.classList.add('hidden');
      el.setAttribute('aria-hidden', 'true');
      root.classList.remove('has-ticker');
      el.innerHTML = '';
      return;
    }

    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    root.classList.add('has-ticker');
    el.innerHTML = buildTickerMarqueeHtml(parts);
  }

  async function pollDisplaySettings() {
    try {
      const r = await fetch('/api/display-settings');
      if (!r.ok) return;
      const next = await r.json();
      const snap = JSON.stringify({
        show_title: next.show_title,
        refresh_interval: next.refresh_interval,
        header_enabled: next.header_enabled,
        header_title: next.header_title,
        header_logo: next.header_logo,
        footer_enabled: next.footer_enabled,
        footer_logos: next.footer_logos,
        ticker_enabled: next.ticker_enabled,
        ticker_texts: next.ticker_texts,
      });
      if (snap === lastLayoutSnapshot) return;
      lastLayoutSnapshot = snap;
      Object.assign(SETTINGS, next);
      initLayout();
      updateSiteTicker();
      startClock();
    } catch { /* ignore */ }
  }

  let clockTimer = null;
  function startClock() {
    const clockEl = document.getElementById('header-clock');
    if (!clockEl || !SETTINGS.header_enabled) return;
    clockEl.textContent = formatClock();
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = setInterval(() => {
      clockEl.textContent = formatClock();
    }, 1000);
  }

  let lastScreensSnapshot = '';

  function screensSnapshot(list) {
    const rows = Array.isArray(list) ? list : [];
    return JSON.stringify(rows.map((s) => ({
      id: s.id,
      type: s.type,
      sort_order: s.sort_order,
      duration: s.duration,
      event_id: s.event_id,
      text_content: s.text_content,
      qr_url: s.qr_url,
      background_color: s.background_color,
      background_image: s.background_image,
      text_color: s.text_color,
      image_path: s.image_path,
      updated_at: s.updated_at,
    })));
  }

  function showNoScreens() {
    clearTimeout(slideTimer);
    clearRefreshTimer();
    currentScreen = null;
    const container = document.getElementById('slide-container');
    if (container) {
      container.innerHTML = '<div class="empty-slide"><h1>Keine Screens konfiguriert</h1></div>';
    }
    const ind = document.getElementById('slide-indicators');
    if (ind) ind.innerHTML = '';
  }

  async function pollDisplayScreens() {
    try {
      const r = await fetch('/api/display-screens');
      if (!r.ok) return;
      const next = await r.json();
      const snap = screensSnapshot(next);
      if (snap === lastScreensSnapshot) return;
      lastScreensSnapshot = snap;

      const prevId = currentScreen?.id;
      SCREENS = Array.isArray(next) ? next : [];

      if (SCREENS.length === 0) {
        showNoScreens();
        return;
      }

      let newIndex = 0;
      if (prevId != null) {
        const idx = SCREENS.findIndex((s) => s.id === prevId);
        if (idx >= 0) newIndex = idx;
      }

      buildIndicators();
      await goTo(newIndex, { fromPoll: true });
    } catch { /* ignore */ }
  }

  async function pollDisplayOnCycleComplete() {
    await pollDisplaySettings();
    await pollDisplayScreens();
  }

  function isSlideshowCycleComplete(prevIndex, nextIndex, requestedIndex) {
    if (SCREENS.length === 0) return false;
    const lastIdx = SCREENS.length - 1;
    return prevIndex === lastIdx && nextIndex === 0 && requestedIndex > prevIndex;
  }

  lastLayoutSnapshot = layoutSnapshot();
  lastScreensSnapshot = screensSnapshot(SCREENS);
  initLayout();
  updateSiteTicker();
  startClock();

  if (!SCREENS || SCREENS.length === 0) {
    showNoScreens();
  }

  function buildIndicators() {
    const ind = document.getElementById('slide-indicators');
    ind.innerHTML = '';
    SCREENS.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = 'indicator' + (i === 0 ? ' active' : '');
      dot.onclick = () => goTo(i);
      ind.appendChild(dot);
    });
  }

  function parseCategories(data) {
    if (!data) return [];
    if (Array.isArray(data.categories) && data.categories.length > 0) {
      return data.categories;
    }
    const source = data.raw !== undefined ? data.raw : data;
    if (Array.isArray(source)) return source;
    const paths = [
      source?.categories,
      source?.ticketCategories,
      source?.ticketcategories,
      source?.datasets,
      source?.content,
      source?.items,
      source?.data?.ticketCategories,
      source?.event?.ticketCategories,
    ];
    for (const list of paths) {
      if (Array.isArray(list) && list.length > 0) return list;
    }
    if (Array.isArray(data.categories)) return data.categories;
    return [];
  }

  function categoryName(cat) {
    return cat.name || cat.title || cat.label || '–';
  }

  function categoryAvailable(cat) {
    if (cat.available_capacity !== undefined && cat.available_capacity !== null) {
      return cat.available_capacity;
    }
    const total = categoryTotalCapacity(cat);
    const sold = cat.sold_count ?? cat.soldCount ?? cat.numberOfSoldTickets
      ?? cat.soldTickets ?? cat.sold;
    if (total !== undefined && sold !== undefined) {
      return Math.max(0, total - sold);
    }
    return cat.availableCapacity
      ?? cat.remainingNumberOfTickets ?? cat.availableNumberOfTickets
      ?? cat.numberOfRemainingTickets ?? cat.remainingCapacity
      ?? cat.freeSeats ?? cat.available;
  }

  function categoryTotalCapacity(cat) {
    return cat.total_capacity ?? cat.totalCapacity
      ?? cat.totalNumberOfTickets ?? cat.capacity;
  }

  function categoryPriceValue(cat) {
    if (cat.price !== undefined) return cat.price;
    if (cat.amount !== undefined) return cat.amount;
    if (cat.priceInCents !== undefined) return cat.priceInCents;
    return undefined;
  }

  function isTicketSlide(screen) {
    return screen.type === 'tickets' || screen.type === 'prices';
  }

  async function fetchCategories(eventId, { useCache = true } = {}) {
    const eid = (eventId || '').trim();
    if (!eid) return { error: 'Keine Event-ID' };
    if (useCache) {
      const cached = readClientCache(categoriesCache, eid);
      if (cached) return cached;
    }
    try {
      const r = await fetch(`/api/eventfrog/categories?event_id=${encodeURIComponent(eid)}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const stale = readClientCache(categoriesCache, eid);
        if (stale) return stale;
        return { error: data.error || `API-Fehler ${r.status}` };
      }
      writeClientCache(categoriesCache, eid, data);
      return data;
    } catch (e) {
      const stale = readClientCache(categoriesCache, eid);
      if (stale) return stale;
      return { error: e.message || 'Netzwerkfehler' };
    }
  }

  async function fetchEventSummary(eventId, { useCache = true } = {}) {
    const eid = (eventId || '').trim();
    if (!eid) return { error: 'Keine Event-ID' };
    if (useCache) {
      const cached = readClientCache(eventSummaryCache, eid);
      if (cached) return cached;
    }
    try {
      const r = await fetch(`/api/eventfrog/event?event_id=${encodeURIComponent(eid)}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        const stale = readClientCache(eventSummaryCache, eid);
        if (stale) return stale;
        return { error: data.error || `API-Fehler ${r.status}` };
      }
      const summary = data.event || null;
      if (summary) writeClientCache(eventSummaryCache, eid, summary);
      return summary;
    } catch (e) {
      const stale = readClientCache(eventSummaryCache, eid);
      if (stale) return stale;
      return { error: e.message || 'Netzwerkfehler' };
    }
  }

  async function fetchBarcodeDataUrl(url) {
    if (!url) return '';
    const cached = readClientCache(barcodeCache, url);
    if (cached) return cached;
    try {
      const r = await fetch(`/api/qrcode?url=${encodeURIComponent(url)}`);
      if (!r.ok) return readClientCache(barcodeCache, url) || '';
      const data = await r.json();
      const qr = data.qr || '';
      if (qr) writeClientCache(barcodeCache, url, qr);
      return qr;
    } catch {
      return readClientCache(barcodeCache, url) || '';
    }
  }

  function bookingUrlForScreen(screen, eventSummary) {
    const custom = (screen.qr_url || '').trim();
    if (custom) return custom;
    return eventSummary?.bookingUrl || null;
  }

  function renderEventDateHeader(eventSummary) {
    if (!eventSummary?.dateLabel) return '';
    const todayBadge = eventSummary.isToday
      ? '<span class="event-date-today">heute</span>'
      : '';
    return `
      <div class="tickets-event-date">
        <span class="event-date-text">${escapeHtml(eventSummary.dateLabel)}</span>
        ${todayBadge}
      </div>`;
  }

  function renderEventTimeText(screen) {
    const timeText = (screen.text_content || '').trim();
    if (!timeText) return '';
    return `<p class="tickets-event-time">${escapeHtml(timeText)}</p>`;
  }

  function renderEventEndedContent(eventSummary) {
    const dateLine = eventSummary?.dateLabel
      ? `<p class="event-ended-date">${escapeHtml(eventSummary.dateLabel)}</p>`
      : '';
    return `
      <div class="tickets-table-content event-ended-content">
        ${dateLine}
        <h1 class="event-ended-title">Veranstaltung beendet</h1>
        <p class="event-ended-msg">Diese Anzeige ist nach dem Eventdatum nicht mehr aktiv.</p>
      </div>`;
  }

  async function renderReservationBlock(screen, eventSummary) {
    const url = bookingUrlForScreen(screen, eventSummary);
    if (!url) return '';
    const barcode = await fetchBarcodeDataUrl(url);
    if (!barcode) return '';
    return `
      <div class="tickets-reservation">
        <p class="tickets-reservation-text">${escapeHtml('Reservieren Sie\njetzt online!')}</p>
        <a href="${escapeHtml(url)}" class="tickets-barcode-link" target="_blank" rel="noopener noreferrer" title="Reservierung im Browser öffnen">
          <div class="tickets-barcode-wrap">
            <img src="${barcode}" class="tickets-barcode" alt="Barcode zur Reservierung" />
          </div>
        </a>
      </div>`;
  }

  function formatPrice(amount) {
    if (typeof amount === 'number') {
      return (amount / 100).toFixed(2).replace('.', ',') + ' €';
    }
    return String(amount);
  }

  function availabilityLabel(n) {
    if (n === undefined || n === null) return '–';
    return String(n);
  }

  function isLowAvailability(n) {
    return typeof n === 'number' && n > 0 && n <= 16;
  }

  function capacityLabel(n) {
    if (n === undefined || n === null) return '–';
    return String(n);
  }

  function categoryPrice(cat) {
    const val = categoryPriceValue(cat);
    if (val !== undefined) return formatPrice(val);
    if (cat.priceText) return String(cat.priceText);
    return '–';
  }

  function buildTicketTableRows(categories, eventId) {
    if (categories.length === 0) {
      return `<tr><td colspan="4" class="no-data">Keine Ticketkategorien für Event ${escapeHtml(eventId)}. Im Admin unter „API testen“ prüfen — ist Ticketverkauf für dieses Event aktiv?</td></tr>`;
    }
    return categories.map(cat => {
      const available = categoryAvailable(cat);
      const total = categoryTotalCapacity(cat);
      const soldOut = available === 0;
      if (soldOut) {
        return `
          <tr class="sold-out">
            <td class="col-name">${escapeHtml(categoryName(cat))}</td>
            <td colspan="3" class="col-sold-out">Ausverkauft</td>
          </tr>`;
      }
      const lowAvail = isLowAvailability(available);
      return `
          <tr${lowAvail ? ' class="availability-low"' : ''}>
            <td class="col-name">${escapeHtml(categoryName(cat))}</td>
            <td class="col-available${lowAvail ? ' availability-low' : ''}">${escapeHtml(availabilityLabel(available))}</td>
            <td class="col-total">${escapeHtml(capacityLabel(total))}</td>
            <td class="col-price">${escapeHtml(categoryPrice(cat))}</td>
          </tr>`;
    }).join('');
  }

  async function refreshTicketTableOnly(screen) {
    const eventId = (screen.event_id || '').trim();
    if (!eventId) return;
    const tbody = document.querySelector('.slide-tickets .tickets-table tbody, .slide-prices .tickets-table tbody');
    if (!tbody) return;
    const catData = await fetchCategories(eventId, { useCache: false });
    if (catData.error) return;
    tbody.innerHTML = buildTicketTableRows(parseCategories(catData), eventId);
  }

  async function renderTicketsTableSlide(screen) {
    const eventId = (screen.event_id || '').trim();
    if (!eventId) {
      return `
        <div class="tickets-table-content">
          <p class="tickets-table-msg">Keine Event-ID am Screen hinterlegt.</p>
        </div>`;
    }

    const eventSummary = await fetchEventSummary(eventId);
    if (eventSummary?.error) {
      return `
        <div class="tickets-table-content">
          <p class="tickets-table-msg">${escapeHtml(eventSummary.error)}</p>
        </div>`;
    }

    if (eventSummary?.isPast) {
      return renderEventEndedContent(eventSummary);
    }

    const catData = await fetchCategories(eventId);
    if (catData.error) {
      return `
        <div class="tickets-table-content">
          <p class="tickets-table-msg">${escapeHtml(catData.error)}</p>
        </div>`;
    }

    const categories = parseCategories(catData);
    const reservation = await renderReservationBlock(screen, eventSummary);
    const rows = buildTicketTableRows(categories, eventId);

    return `
      <div class="tickets-table-content">
        ${renderEventDateHeader(eventSummary)}
        ${renderEventTimeText(screen)}
        <div class="tickets-table-scroll">
          <table class="tickets-table">
            <thead>
              <tr>
                <th>Kategorie</th>
                <th>Frei</th>
                <th>Kapazität</th>
                <th>Preis</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${reservation}
      </div>`;
  }

  async function renderQRSlide(screen) {
    let qrImg = '';
    if (screen.qr_url) {
      try {
        const r = await fetch(`/api/qrcode?url=${encodeURIComponent(screen.qr_url)}`);
        if (r.ok) {
          const { qr } = await r.json();
          qrImg = `<img src="${qr}" class="qr-image" alt="QR Code" />`;
        }
      } catch { /* empty */ }
    }
    return `
      <div class="qr-content">
        <div class="qr-text">${escapeHtml(screen.text_content || 'Jetzt buchen')}</div>
        <div class="qr-code-container">${qrImg}</div>
        ${screen.qr_url ? `<div class="qr-url">${escapeHtml(screen.qr_url)}</div>` : ''}
      </div>`;
  }

  function renderSponsorSlide(screen) {
    let content = '';
    if (screen.image_path) {
      content += `<img src="${screen.image_path}" class="sponsor-image" alt="Sponsor" />`;
    }
    if (screen.text_content) {
      content += `<div class="sponsor-text">${escapeHtml(screen.text_content)}</div>`;
    }
    return `<div class="sponsor-content">${content}</div>`;
  }

  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function applySlideBackground(container, screen) {
    container.style.backgroundColor = screen.background_color || '#000000';
    if (screen.background_image) {
      container.style.backgroundImage = `url(${screen.background_image})`;
      container.style.backgroundSize = 'cover';
      container.style.backgroundPosition = 'center';
    } else {
      container.style.backgroundImage = '';
    }
  }

  async function renderSlide(screen) {
    const token = ++renderToken;
    const container = document.getElementById('slide-container');
    if (!container) return;

    container.replaceChildren();
    applySlideBackground(container, screen);

    const slide = document.createElement('div');
    slide.className = 'slide slide-' + screen.type;
    slide.style.color = screen.text_color || '#ffffff';

    let html = '';
    if (isTicketSlide(screen)) {
      html = await renderTicketsTableSlide(screen);
    } else if (screen.type === 'qrcode') {
      html = await renderQRSlide(screen);
    } else if (screen.type === 'sponsor') {
      html = renderSponsorSlide(screen);
    } else {
      html = `<div class="slide-text">${escapeHtml(screen.text_content || '')}</div>`;
    }

    if (token !== renderToken) return;

    slide.innerHTML = html;
    container.replaceChildren(slide);
  }

  function clearRefreshTimer() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function startRefreshTimer(screen) {
    clearRefreshTimer();
    if (!screen || !isTicketSlide(screen)) return;
    const screenId = screen.id;
    refreshTimer = setInterval(() => {
      if (currentScreen && currentScreen.id === screenId) {
        refreshTicketTableOnly(currentScreen);
      }
    }, refreshSeconds * 1000);
  }

  function startProgress(duration) {
    const bar = document.getElementById('progress-bar');
    bar.style.transition = 'none';
    bar.style.width = '0%';
    setTimeout(() => {
      bar.style.transition = `width ${duration}s linear`;
      bar.style.width = '100%';
    }, 50);
  }

  function updateIndicators() {
    document.querySelectorAll('.indicator').forEach((dot, i) => {
      dot.classList.toggle('active', i === currentIndex);
    });
  }

  async function goTo(index, options = {}) {
    if (SCREENS.length === 0) return;

    clearTimeout(slideTimer);
    clearRefreshTimer();
    const trip = ++goToToken;
    const prevIndex = currentIndex;
    const nextIndex = ((index % SCREENS.length) + SCREENS.length) % SCREENS.length;
    const cycleComplete = !options.fromPoll
      && isSlideshowCycleComplete(prevIndex, nextIndex, index);

    currentIndex = nextIndex;
    updateIndicators();
    const screen = SCREENS[currentIndex];
    currentScreen = screen;
    await renderSlide(screen);
    if (trip !== goToToken) return;

    if (cycleComplete) {
      void pollDisplayOnCycleComplete();
    }

    startRefreshTimer(screen);
    const durationSec = Math.max(1, parseInt(screen.duration, 10) || 10);
    startProgress(durationSec);
    slideTimer = setTimeout(() => {
      if (trip !== goToToken) return;
      goTo(currentIndex + 1);
    }, durationSec * 1000);
  }

  if (SCREENS.length > 0) {
    buildIndicators();
    goTo(0);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') goTo((currentIndex + 1) % SCREENS.length);
    if (e.key === 'ArrowLeft') goTo((currentIndex - 1 + SCREENS.length) % SCREENS.length);
    if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    }
  });
})();
