const MAX_FOOTER_LOGOS = 8;
let footerRemoveQueue = [];

function getFooterPaths() {
  return Array.from(document.querySelectorAll('#footer-logos-list .footer-logo-item'))
    .map(el => el.dataset.path)
    .filter(Boolean);
}

function updateFooterCountHint() {
  const hint = document.getElementById('footer-count-hint');
  if (hint) hint.textContent = `${getFooterPaths().length} / ${MAX_FOOTER_LOGOS} Logos`;
}

function removeFooterLogo(btn) {
  const item = btn.closest('.footer-logo-item');
  const path = item?.dataset.path;
  if (path) footerRemoveQueue.push(path);
  item?.remove();
  updateFooterCountHint();
}

document.getElementById('header_logo')?.addEventListener('change', (e) => {
  const preview = document.getElementById('header-logo-preview');
  if (!preview || !e.target.files?.[0]) return;
  preview.src = URL.createObjectURL(e.target.files[0]);
  preview.classList.remove('hidden');
  const removeCb = document.getElementById('remove_header_logo');
  if (removeCb) removeCb.checked = false;
});

async function saveLayout() {
  const formData = new FormData();
  formData.set('header_enabled', document.getElementById('header_enabled').checked ? 'true' : 'false');
  formData.set('footer_enabled', document.getElementById('footer_enabled').checked ? 'true' : 'false');
  formData.set('header_title', document.getElementById('header_title').value);

  if (document.getElementById('remove_header_logo')?.checked) {
    formData.set('remove_header_logo', 'true');
  }

  const headerFile = document.getElementById('header_logo')?.files?.[0];
  if (headerFile) formData.append('header_logo', headerFile);

  formData.set('footer_keep', JSON.stringify(getFooterPaths()));
  if (footerRemoveQueue.length) {
    formData.set('footer_remove', JSON.stringify(footerRemoveQueue));
  }

  const footerFiles = document.getElementById('footer_add')?.files;
  const slotsLeft = MAX_FOOTER_LOGOS - getFooterPaths().length;
  if (footerFiles) {
    for (let i = 0; i < Math.min(footerFiles.length, slotsLeft); i++) {
      formData.append('footer_add', footerFiles[i]);
    }
  }

  try {
    const r = await apiFetch('/api/layout', { method: 'POST', body: formData });
    if (!r.ok) throw new Error((await r.json()).error || 'Speichern fehlgeschlagen');
    showToast('Layout gespeichert!');
    footerRemoveQueue = [];
    setTimeout(() => window.location.reload(), 600);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

updateFooterCountHint();
