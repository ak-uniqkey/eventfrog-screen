(function() {
  let currentIndex = 0;
  let slideTimer = null;
  let refreshTimer = null;
  let currentScreen = null;

  const refreshSeconds = Math.max(5, parseInt(SETTINGS.refresh_interval, 10) || 15);

  if (!SCREENS || SCREENS.length === 0) {
    document.getElementById('slide-container').innerHTML =
      '<div class="empty-slide"><h1>Keine Screens konfiguriert</h1></div>';
    return;
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
    return data.categories || data.ticketCategories || data.ticketcategories
      || (Array.isArray(data) ? data : []);
  }

  async function fetchEventData(eventId) {
    const eid = eventId || SETTINGS.event_id;
    if (!eid) return null;
    try {
      const r = await fetch(`/api/eventfrog/event?event_id=${encodeURIComponent(eid)}`);
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  async function fetchCategories(eventId) {
    const eid = eventId || SETTINGS.event_id;
    if (!eid) return null;
    try {
      const r = await fetch(`/api/eventfrog/categories?event_id=${encodeURIComponent(eid)}`);
      if (!r.ok) return null;
      return await r.json();
    } catch { return null; }
  }

  function formatPrice(amount) {
    const currency = SETTINGS.currency || 'CHF';
    if (typeof amount === 'number') {
      return (amount / 100).toFixed(2) + ' ' + currency;
    }
    return amount + ' ' + currency;
  }

  function availabilityLabel(n) {
    if (n === undefined || n === null) return '–';
    if (n === 0) return 'Ausverkauft';
    return String(n);
  }

  function renderCategoryCard(cat, screen, mode) {
    const name = cat.name || cat.title || 'Kategorie';
    const available = cat.available_capacity;
    const soldOut = available === 0;
    const price = cat.price !== undefined ? formatPrice(cat.price)
      : (cat.amount !== undefined ? formatPrice(cat.amount) : null);

    let mainValue = '';
    let mainLabel = '';
    if (mode === 'tickets') {
      mainValue = availabilityLabel(available);
      mainLabel = 'verfügbar';
    } else {
      mainValue = price || '–';
      mainLabel = available !== undefined ? `${availabilityLabel(available)} verfügbar` : '';
    }

    return `
      <article class="ticket-card ${soldOut ? 'sold-out' : ''}">
        <h3 class="card-title">${escapeHtml(name)}</h3>
        <div class="card-main">${escapeHtml(mainValue)}</div>
        <div class="card-sub">${escapeHtml(mainLabel)}</div>
        ${mode === 'prices' && price ? `<div class="card-price">${escapeHtml(price)}</div>` : ''}
      </article>`;
  }

  function renderCardsSlide(screen, categories, mode) {
    const title = screen.text_content || (mode === 'tickets' ? 'Verfügbarkeit' : 'Tickets & Preise');
    let cardsHtml = '';

    if (categories.length > 0) {
      cardsHtml = categories.map(cat => renderCategoryCard(cat, screen, mode)).join('');
    } else {
      cardsHtml = '<div class="cards-empty">Keine Ticketkategorien verfügbar</div>';
    }

    return `
      <div class="cards-content">
        <h1 class="cards-title">${escapeHtml(title)}</h1>
        <div class="cards-grid">${cardsHtml}</div>
      </div>`;
  }

  function renderEventSummaryCard(eventName, available, total) {
    return `
      <article class="ticket-card summary-card">
        <h3 class="card-title">${escapeHtml(eventName)}</h3>
        <div class="card-main">${escapeHtml(availabilityLabel(available))}</div>
        <div class="card-sub">Plätze gesamt verfügbar</div>
        ${total !== undefined && total !== null ? `<div class="card-meta">von ${total} Plätzen</div>` : ''}
      </article>`;
  }

  async function renderTicketsSlide(screen) {
    const [eventData, catData] = await Promise.all([
      fetchEventData(screen.event_id),
      fetchCategories(screen.event_id),
    ]);
    const categories = parseCategories(catData);
    if (categories.length > 0) {
      return renderCardsSlide(screen, categories, 'tickets');
    }

    let eventName = screen.text_content || 'Event';
    let available;
    let total;
    if (eventData) {
      const event = eventData.event || eventData;
      if (event.name) eventName = event.name;
      available = event.available_capacity;
      total = event.capacity;
    }
    return `
      <div class="cards-content">
        <h1 class="cards-title">${escapeHtml(screen.text_content || 'Verfügbarkeit')}</h1>
        <div class="cards-grid cards-grid--few">
          ${renderEventSummaryCard(eventName, available, total)}
        </div>
      </div>`;
  }

  async function renderPricesSlide(screen) {
    const catData = await fetchCategories(screen.event_id);
    const categories = parseCategories(catData);
    return renderCardsSlide(screen, categories, 'prices');
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
    const container = document.getElementById('slide-container');
    container.innerHTML = '';
    applySlideBackground(container, screen);

    const slide = document.createElement('div');
    slide.className = 'slide slide-' + screen.type;
    slide.style.color = screen.text_color || '#ffffff';

    if (screen.type === 'tickets') {
      slide.innerHTML = await renderTicketsSlide(screen);
    } else if (screen.type === 'prices') {
      slide.innerHTML = await renderPricesSlide(screen);
    } else if (screen.type === 'qrcode') {
      slide.innerHTML = await renderQRSlide(screen);
      container.appendChild(slide);
      return;
    } else if (screen.type === 'sponsor') {
      slide.innerHTML = renderSponsorSlide(screen);
    } else {
      slide.innerHTML = `<div class="slide-text">${escapeHtml(screen.text_content || '')}</div>`;
    }

    container.appendChild(slide);
  }

  function clearRefreshTimer() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function startRefreshTimer(screen) {
    clearRefreshTimer();
    if (!screen || (screen.type !== 'tickets' && screen.type !== 'prices')) return;
    refreshTimer = setInterval(() => {
      if (currentScreen && currentScreen.id === screen.id) {
        renderSlide(screen);
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

  async function goTo(index) {
    clearTimeout(slideTimer);
    clearRefreshTimer();
    currentIndex = index;
    updateIndicators();
    const screen = SCREENS[currentIndex];
    currentScreen = screen;
    await renderSlide(screen);
    startRefreshTimer(screen);
    startProgress(screen.duration || 10);
    slideTimer = setTimeout(() => {
      goTo((currentIndex + 1) % SCREENS.length);
    }, (screen.duration || 10) * 1000);
  }

  buildIndicators();
  goTo(0);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') goTo((currentIndex + 1) % SCREENS.length);
    if (e.key === 'ArrowLeft') goTo((currentIndex - 1 + SCREENS.length) % SCREENS.length);
    if (e.key === 'f' || e.key === 'F') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    }
  });
})();
