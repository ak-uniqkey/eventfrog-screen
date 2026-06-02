// ---- State ----
let editingId = null;

async function apiFetch(url, options = {}) {
  const r = await fetch(url, { credentials: 'same-origin', ...options });
  if (r.status === 401) {
    window.location.href = '/admin/login?next=' + encodeURIComponent(window.location.pathname);
    throw new Error('Nicht angemeldet');
  }
  return r;
}

// ---- Toast ----
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast hidden'; }, 3000);
}

// ---- Logout ----
document.getElementById('btn-logout')?.addEventListener('click', async () => {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch { /* redirect on 401 anyway */ }
  window.location.href = '/admin/login';
});

// ---- Eventfrog API test ----
async function testEventfrogApi() {
  const eventId = document.getElementById('test_event_id')?.value?.trim();
  const out = document.getElementById('api-test-result');
  if (!eventId) {
    showToast('Bitte Event-ID zum Testen eingeben', 'error');
    return;
  }
  out.classList.remove('hidden');
  out.textContent = 'Teste…';
  try {
    const r = await apiFetch(`/api/eventfrog/test?event_id=${encodeURIComponent(eventId)}`);
    const data = await r.json();
    out.textContent = JSON.stringify(data, null, 2);
    if (data.ok) showToast(`${data.categories_count} Kategorien geladen`);
    else showToast(data.error || 'Test fehlgeschlagen', 'error');
  } catch (err) {
    out.textContent = err.message;
    showToast(err.message, 'error');
  }
}

// ---- Settings ----
document.getElementById('settings-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const apiKeyEl = document.getElementById('api_key');
  const apiKeyVal = apiKeyEl.value.trim();
  const data = {
    show_title: document.getElementById('show_title').value,
    currency: document.getElementById('currency').value,
    refresh_interval: document.getElementById('refresh_interval').value,
  };
  if (apiKeyVal) data.api_key = apiKeyVal;
  try {
    const r = await apiFetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error((await r.json()).error);
    apiKeyEl.value = '';
    showToast('Einstellungen gespeichert!');
  } catch (err) {
    showToast(err.message, 'error');
  }
});

// ---- Modal ----
function openModal(screen) {
  editingId = screen ? screen.id : null;
  document.getElementById('modal-title').textContent = screen ? 'Edit Screen' : 'Add Screen';
  document.getElementById('screen-id').value = screen ? screen.id : '';
  document.getElementById('f-name').value = screen ? screen.name : '';
  document.getElementById('f-type').value = screen ? screen.type : 'tickets';
  document.getElementById('f-sort').value = screen ? screen.sort_order : 0;
  document.getElementById('f-duration').value = screen ? screen.duration : 10;
  document.getElementById('f-bg-color').value = screen ? (screen.background_color || '#000000') : '#000000';
  document.getElementById('f-bg-color-val').textContent = screen ? (screen.background_color || '#000000') : '#000000';
  document.getElementById('f-text-color').value = screen ? (screen.text_color || '#ffffff') : '#ffffff';
  document.getElementById('f-text-color-val').textContent = screen ? (screen.text_color || '#ffffff') : '#ffffff';
  document.getElementById('f-bg-image').value = screen ? (screen.background_image || '') : '';
  document.getElementById('f-text').value = screen ? (screen.text_content || '') : '';
  document.getElementById('f-qr-url').value = screen ? (screen.qr_url || '') : '';
  document.getElementById('f-event-id').value = screen ? (screen.event_id || '') : '';
  document.getElementById('f-active').checked = screen ? screen.active : true;
  document.getElementById('f-image').value = '';
  const preview = document.getElementById('image-preview');
  if (screen && screen.image_path) {
    preview.innerHTML = `<img src="${screen.image_path}" alt="Current image" />`;
    preview.classList.remove('hidden');
  } else {
    preview.innerHTML = '';
    preview.classList.add('hidden');
  }
  onTypeChange(document.getElementById('f-type').value);
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  editingId = null;
}

document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
});

// ---- Type-based field visibility ----
function onTypeChange(type) {
  const qrField = document.getElementById('field-qr-url');
  const imgField = document.getElementById('field-image');
  const eventField = document.getElementById('field-event-id');
  const textLabel = document.getElementById('text-content-label');

  qrField.style.display = type === 'qrcode' ? '' : 'none';
  imgField.style.display = (type === 'sponsor') ? '' : 'none';
  const needsEvent = type === 'tickets' || type === 'prices';
  eventField.style.display = needsEvent ? '' : 'none';
  document.getElementById('f-event-id').required = needsEvent;

  if (type === 'tickets' || type === 'prices') textLabel.textContent = 'Überschrift (optional)';
  else if (type === 'qrcode') textLabel.textContent = 'QR Code Label';
  else textLabel.textContent = 'Text Content';
}

// Color pickers
document.getElementById('f-bg-color').addEventListener('input', function() {
  document.getElementById('f-bg-color-val').textContent = this.value;
});
document.getElementById('f-text-color').addEventListener('input', function() {
  document.getElementById('f-text-color-val').textContent = this.value;
});

// ---- Image Preview ----
function previewImage(input) {
  const preview = document.getElementById('image-preview');
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      preview.innerHTML = `<img src="${e.target.result}" alt="Preview" />`;
      preview.classList.remove('hidden');
    };
    reader.readAsDataURL(input.files[0]);
  }
}

// ---- Save Screen ----
async function saveScreen() {
  const form = document.getElementById('screen-form');
  const type = document.getElementById('f-type').value;
  const eventId = document.getElementById('f-event-id').value.trim();
  if ((type === 'tickets' || type === 'prices') && !eventId) {
    showToast('Event-ID ist für Ticket-Screens erforderlich', 'error');
    return;
  }

  const formData = new FormData(form);
  formData.set('active', document.getElementById('f-active').checked ? 'true' : 'false');

  try {
    const id = editingId;
    const url = id ? `/api/screens/${id}` : '/api/screens';
    const method = id ? 'PUT' : 'POST';
    const r = await apiFetch(url, { method, body: formData });
    if (!r.ok) throw new Error((await r.json()).error || 'Save failed');
    showToast(id ? 'Screen updated!' : 'Screen created!');
    closeModal();
    reloadScreens();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---- Edit Screen ----
async function editScreen(id) {
  try {
    const r = await apiFetch('/api/screens');
    const screens = await r.json();
    const screen = screens.find(s => s.id === id);
    if (screen) openModal(screen);
  } catch (err) {
    showToast('Failed to load screen data', 'error');
  }
}

// ---- Delete Screen ----
async function deleteScreen(btnOrId, name) {
  // Support both (element) and legacy (id, name) call signatures
  let id, screenName;
  if (typeof btnOrId === 'object' && btnOrId !== null) {
    id = parseInt(btnOrId.dataset.id);
    screenName = btnOrId.dataset.name;
  } else {
    id = btnOrId;
    screenName = name;
  }
  if (!confirm(`Delete screen "${screenName}"?`)) return;
  try {
    const r = await apiFetch(`/api/screens/${id}`, { method: 'DELETE' });
    if (!r.ok) throw new Error((await r.json()).error);
    showToast('Screen deleted');
    reloadScreens();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---- Reload Screens List ----
async function reloadScreens() {
  try {
    const r = await apiFetch('/api/screens');
    const screens = await r.json();
    const container = document.getElementById('screens-list');

    if (screens.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No screens configured yet.</p>
          <button class="btn btn-primary" onclick="openModal()">Add your first screen</button>
        </div>`;
      return;
    }

    const rows = screens.map(s => `
      <tr data-id="${s.id}">
        <td class="drag-handle">⠿</td>
        <td class="screen-name">${escHtml(s.name)}</td>
        <td class="screen-event-id">${escHtml(s.event_id || '–')}</td>
        <td><span class="badge badge-${s.type}">${s.type}</span></td>
        <td>${s.duration}s</td>
        <td>
          <span class="status-dot ${s.active ? 'active' : 'inactive'}"></span>
          ${s.active ? 'Active' : 'Inactive'}
        </td>
        <td class="actions">
          <button class="btn btn-sm btn-secondary" onclick="editScreen(${s.id})">✏️ Edit</button>
          <button class="btn btn-sm btn-danger" data-id="${s.id}" data-name="${escHtml(s.name)}" onclick="deleteScreen(this)">🗑</button>
        </td>
      </tr>`).join('');

    container.innerHTML = `
      <div class="screens-table-wrap">
        <table class="screens-table">
          <thead>
            <tr>
              <th>⠿</th><th>Name</th><th>Event-ID</th><th>Type</th><th>Duration</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody id="screens-tbody">${rows}</tbody>
        </table>
      </div>`;
    initDragSort();
  } catch (err) {
    console.error(err);
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ---- Drag-to-reorder ----
function initDragSort() {
  const tbody = document.getElementById('screens-tbody');
  if (!tbody) return;
  let dragging = null;

  tbody.querySelectorAll('tr').forEach(row => {
    row.setAttribute('draggable', 'true');
    row.addEventListener('dragstart', () => { dragging = row; row.style.opacity = '0.5'; });
    row.addEventListener('dragend', () => { row.style.opacity = ''; dragging = null; saveOrder(); });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (dragging && dragging !== row) {
        const rect = row.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (e.clientY < mid) tbody.insertBefore(dragging, row);
        else tbody.insertBefore(dragging, row.nextSibling);
      }
    });
  });
}

async function saveOrder() {
  const tbody = document.getElementById('screens-tbody');
  if (!tbody) return;
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const order = rows.map((r, i) => ({ id: parseInt(r.dataset.id), sort_order: i }));
  try {
    await apiFetch('/api/screens/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    });
  } catch (err) {
    console.error('Reorder failed', err);
  }
}

// ---- Init ----
onTypeChange('tickets');
initDragSort();
