(function() {
  let currentIndex = 0;
  let slideTimer = null;
  let refreshTimer = null;
  let currentScreen = null;

  const refreshSeconds = Math.max(5, parseInt(SETTINGS.refresh_interval, 10) || 15);

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
    }

    if (SETTINGS.footer_enabled) {
      const logos = Array.isArray(SETTINGS.footer_logos) ? SETTINGS.footer_logos : [];
      if (logos.length > 0) {
        footer.classList.remove('hidden');
        footer.setAttribute('aria-hidden', 'false');
        footerWrap.innerHTML = logos.map(src =>
          `<img src="${src}" alt="" class="footer-logo" />`
        ).join('');
      }
    }
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

  initLayout();
  startClock();

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
    return cat.available_capacity ?? cat.availableCapacity
      ?? cat.remainingCapacity ?? cat.freeSeats ?? cat.available;
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

  async function fetchCategories(eventId) {
    const eid = (eventId || '').trim();
    if (!eid) return { error: 'Keine Event-ID' };
    try {
      const r = await fetch(`/api/eventfrog/categories?event_id=${encodeURIComponent(eid)}`);
      const data = await r.json().catch(() => ({}));
      if (!r.ok) return { error: data.error || `API-Fehler ${r.status}` };
      return data;
    } catch (e) {
      return { error: e.message || 'Netzwerkfehler' };
    }
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

  function categoryPrice(cat) {
    const val = categoryPriceValue(cat);
    if (val !== undefined) return formatPrice(val);
    if (cat.priceText) return String(cat.priceText);
    return '–';
  }

  async function renderTicketsTableSlide(screen) {
    const eventId = (screen.event_id || '').trim();
    if (!eventId) {
      return `
        <div class="tickets-table-content">
          <p class="tickets-table-msg">Keine Event-ID am Screen hinterlegt.</p>
        </div>`;
    }

    const catData = await fetchCategories(eventId);
    if (catData.error) {
      return `
        <div class="tickets-table-content">
          <p class="tickets-table-msg">${escapeHtml(catData.error)}</p>
        </div>`;
    }

    const categories = parseCategories(catData);
    const title = screen.text_content || '';

    let rows = '';
    if (categories.length > 0) {
      rows = categories.map(cat => {
        const available = categoryAvailable(cat);
        const soldOut = available === 0;
        return `
          <tr class="${soldOut ? 'sold-out' : ''}">
            <td class="col-name">${escapeHtml(categoryName(cat))}</td>
            <td class="col-available">${escapeHtml(availabilityLabel(available))}</td>
            <td class="col-price">${escapeHtml(categoryPrice(cat))}</td>
          </tr>`;
      }).join('');
    } else {
      rows = `<tr><td colspan="3" class="no-data">Keine Ticketkategorien für Event ${escapeHtml(eventId)}. Im Admin unter „API testen“ prüfen — ist Ticketverkauf für dieses Event aktiv?</td></tr>`;
    }

    return `
      <div class="tickets-table-content">
        ${title ? `<h1 class="tickets-table-title">${escapeHtml(title)}</h1>` : ''}
        <table class="tickets-table">
          <thead>
            <tr>
              <th>Kategorie</th>
              <th>Freie Plätze</th>
              <th>Preis</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
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
    const container = document.getElementById('slide-container');
    container.innerHTML = '';
    applySlideBackground(container, screen);

    const slide = document.createElement('div');
    slide.className = 'slide slide-' + screen.type;
    slide.style.color = screen.text_color || '#ffffff';

    if (isTicketSlide(screen)) {
      slide.innerHTML = await renderTicketsTableSlide(screen);
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
    if (!screen || !isTicketSlide(screen)) return;
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
