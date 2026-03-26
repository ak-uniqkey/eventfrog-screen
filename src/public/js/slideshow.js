(function() {
  let currentIndex = 0;
  let timer = null;

  if (!SCREENS || SCREENS.length === 0) {
    document.getElementById('slide-container').innerHTML =
      '<div style="color:white;text-align:center;padding:2em"><h1>Keine Screens konfiguriert</h1><p><a href="/admin" style="color:#4fc3f7">Zur Konfiguration</a></p></div>';
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

  async function renderSlide(screen) {
    const container = document.getElementById('slide-container');
    container.innerHTML = '';

    container.style.backgroundColor = screen.background_color || '#000000';
    if (screen.background_image) {
      container.style.backgroundImage = `url(${screen.background_image})`;
      container.style.backgroundSize = 'cover';
      container.style.backgroundPosition = 'center';
    } else {
      container.style.backgroundImage = '';
    }

    const slide = document.createElement('div');
    slide.className = 'slide slide-' + screen.type;
    slide.style.color = screen.text_color || '#ffffff';

    if (screen.type === 'tickets') {
      const data = await fetchEventData(screen.event_id);
      slide.innerHTML = renderTicketsSlide(screen, data);
    } else if (screen.type === 'prices') {
      const data = await fetchCategories(screen.event_id);
      slide.innerHTML = renderPricesSlide(screen, data);
    } else if (screen.type === 'qrcode') {
      slide.innerHTML = await renderQRSlide(screen);
      container.appendChild(slide);
      return;
    } else if (screen.type === 'sponsor') {
      slide.innerHTML = renderSponsorSlide(screen);
    } else {
      slide.innerHTML = `<div class="slide-text">${screen.text_content || ''}</div>`;
    }

    container.appendChild(slide);
  }

  function renderTicketsSlide(screen, data) {
    let available = '–';
    let eventName = screen.text_content || 'Event';
    let totalCapacity = '–';

    if (data) {
      const event = data.event || data;
      if (event.name) eventName = event.name;
      if (event.available_capacity !== undefined) available = event.available_capacity;
      if (event.capacity !== undefined) totalCapacity = event.capacity;
    }

    return `
      <div class="tickets-content">
        <div class="event-name">${eventName}</div>
        <div class="tickets-main">
          <div class="tickets-number">${available}</div>
          <div class="tickets-label">verfügbare Plätze</div>
        </div>
        ${totalCapacity !== '–' ? `<div class="tickets-total">von ${totalCapacity} Plätzen gesamt</div>` : ''}
      </div>`;
  }

  function renderPricesSlide(screen, data) {
    let rows = '';
    let hasData = false;

    if (data) {
      const categories = data.categories || data.ticketCategories || data.ticketcategories || (Array.isArray(data) ? data : []);
      if (categories.length > 0) {
        hasData = true;
        rows = categories.map(cat => `
          <tr>
            <td class="price-name">${cat.name || cat.title || ''}</td>
            <td class="price-available">${cat.available_capacity !== undefined ? cat.available_capacity : '–'}</td>
            <td class="price-amount">${cat.price !== undefined ? formatPrice(cat.price) : (cat.amount !== undefined ? formatPrice(cat.amount) : '–')}</td>
          </tr>`).join('');
      }
    }

    return `
      <div class="prices-content">
        <h1 class="prices-title">${screen.text_content || 'Preisliste'}</h1>
        <table class="prices-table">
          <thead>
            <tr>
              <th>Kategorie</th>
              <th>Verfügbar</th>
              <th>Preis</th>
            </tr>
          </thead>
          <tbody>
            ${hasData ? rows : '<tr><td colspan="3" class="no-data">Keine Preisdaten verfügbar</td></tr>'}
          </tbody>
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
      } catch { /* show empty container on error */ }
    }
    return `
      <div class="qr-content">
        <div class="qr-text">${screen.text_content || 'Jetzt buchen'}</div>
        <div class="qr-code-container">${qrImg}</div>
        ${screen.qr_url ? `<div class="qr-url">${screen.qr_url}</div>` : ''}
      </div>`;
  }

  function renderSponsorSlide(screen) {
    let content = '';
    if (screen.image_path) {
      content += `<img src="${screen.image_path}" class="sponsor-image" alt="Sponsor" />`;
    }
    if (screen.text_content) {
      content += `<div class="sponsor-text">${screen.text_content}</div>`;
    }
    return `<div class="sponsor-content">${content}</div>`;
  }

  function formatPrice(amount) {
    const currency = SETTINGS.currency || 'CHF';
    if (typeof amount === 'number') {
      return (amount / 100).toFixed(2) + ' ' + currency;
    }
    return amount + ' ' + currency;
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
    clearTimeout(timer);
    currentIndex = index;
    updateIndicators();
    const screen = SCREENS[currentIndex];
    await renderSlide(screen);
    startProgress(screen.duration || 10);
    timer = setTimeout(() => {
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
