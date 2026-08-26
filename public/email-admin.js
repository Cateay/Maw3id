(function () {
  'use strict';

  const state = { editingDraftId: null, currentViewId: null, drafts: [], history: [] };

  function root() { return document.querySelector('[data-email-center]'); }
  function qs(selector) { return root()?.querySelector(selector); }

  function getAdminPassword() {
    try { if (typeof adminPassword !== 'undefined' && adminPassword) return adminPassword; } catch (_) {}
    const input = document.getElementById('password') || document.getElementById('loginPassword');
    return input?.value || sessionStorage.getItem('maw3id_admin_password') || '';
  }

  function authHeaders() {
    const password = getAdminPassword();
    if (!password) throw new Error('انتهت جلسة الإدارة. سجّل الدخول مرة أخرى.');
    return { 'Content-Type': 'application/json', 'X-Admin-Password': password };
  }

  async function api(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || 'تعذر تنفيذ العملية.');
      error.status = response.status;
      error.emailStatus = data.status;
      throw error;
    }
    return data;
  }

  function setStatus(text, type) {
    const el = qs('[data-email-status]');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'email-form-status' + (text ? ` ${type || ''}` : '');
  }

  function getRecipient() {
    const type = qs('[data-recipient-type]')?.value;
    return (type === 'other' ? qs('[data-other-recipient]')?.value : qs('[data-booking-recipient]')?.value)?.trim() || '';
  }

  function getFormData() {
    return { to: getRecipient(), subject: qs('[data-email-subject]')?.value?.trim() || '', message: qs('[data-email-body]')?.value?.trim() || '' };
  }

  function validateForm(data) {
    if (!data.to) return 'اختر المستلم أولًا.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.to)) return 'البريد الإلكتروني للمستلم غير صحيح.';
    if (!data.subject) return 'اكتب عنوان الرسالة.';
    if (!data.message) return 'اكتب محتوى الرسالة.';
    return '';
  }

  function setRecipientMode() {
    const type = qs('[data-recipient-type]')?.value;
    const booking = qs('[data-booking-recipient]');
    const other = qs('[data-other-recipient]');
    if (!booking || !other) return;
    const external = type === 'other';
    booking.style.display = external ? 'none' : '';
    other.style.display = external ? '' : 'none';
    booking.required = !external;
    other.required = external;
  }

  function populateRecipients() {
    const select = qs('[data-booking-recipient]');
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">اختر العميل</option>';
    let bookings = [];
    try { bookings = Array.isArray(allBookings) ? allBookings : []; } catch (_) {}
    const seen = new Set();
    bookings.filter(b => b?.email).forEach(booking => {
      const email = String(booking.email).trim().toLowerCase();
      if (seen.has(email)) return;
      seen.add(email);
      const option = document.createElement('option');
      option.value = booking.email;
      option.textContent = `${booking.name || 'بدون اسم'} — ${booking.email}`;
      select.appendChild(option);
    });
    if ([...select.options].some(option => option.value === current)) select.value = current;
  }

  function clearForm(clearStatus = true) {
    ['[data-email-subject]', '[data-email-body]', '[data-booking-recipient]', '[data-other-recipient]'].forEach(sel => { const el = qs(sel); if (el) el.value = ''; });
    const type = qs('[data-recipient-type]'); if (type) type.value = 'booking';
    const title = qs('[data-compose-title]'); if (title) title.textContent = 'رسالة جديدة';
    state.editingDraftId = null;
    setRecipientMode();
    if (clearStatus) setStatus('', '');
  }

  function editDraft(draft, fromFailed = false) {
    state.editingDraftId = fromFailed ? draft.id : draft.id;
    qs('[data-compose-title]').textContent = fromFailed ? 'إعادة محاولة الرسالة' : 'تعديل المسودة';
    const bookingSelect = qs('[data-booking-recipient]');
    const otherInput = qs('[data-other-recipient]');
    const type = qs('[data-recipient-type]');
    const isBooking = [...(bookingSelect?.options || [])].some(option => option.value === draft.recipient);
    type.value = isBooking ? 'booking' : 'other';
    if (isBooking) bookingSelect.value = draft.recipient;
    else otherInput.value = draft.recipient;
    qs('[data-email-subject]').value = draft.subject || '';
    qs('[data-email-body]').value = draft.message || '';
    setRecipientMode();
    setStatus(fromFailed ? 'تم فتح الرسالة لإعادة المحاولة.' : 'تم فتح المسودة للتعديل.', 'info');
    switchTab('compose');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveDraft() {
    const data = getFormData();
    const validation = validateForm(data);
    if (validation) { setStatus(validation, 'error'); return; }
    const button = qs('[data-save-draft]'); if (button) button.disabled = true;
    setStatus('جاري حفظ المسودة...', 'info');
    try {
      const payload = state.editingDraftId ? { ...data, id: state.editingDraftId } : data;
      const result = await api('/api/admin-emails.js', { method: state.editingDraftId ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      state.editingDraftId = result.draft?.id || state.editingDraftId;
      qs('[data-compose-title]').textContent = 'تعديل المسودة';
      setStatus('تم حفظ المسودة بنجاح ✓', 'success');
      await loadDrafts();
    } catch (error) { setStatus(error.message, 'error'); }
    finally { if (button) button.disabled = false; }
  }

  async function sendEmail(event) {
    event?.preventDefault();
    const data = getFormData();
    const validation = validateForm(data);
    if (validation) { setStatus(validation, 'error'); return; }
    const button = qs('[data-send-email]'); if (button) button.disabled = true;
    setStatus('جاري إرسال البريد...', 'info');
    try {
      await api('/api/admin-email.js', { method: 'POST', body: JSON.stringify({ ...data, draft_id: state.editingDraftId || null }) });
      clearForm(false);
      setStatus('تم إرسال البريد بنجاح ✓', 'success');
      await Promise.all([loadDrafts(), loadHistory()]);
    } catch (error) {
      setStatus(error.emailStatus === 'failed' ? `فشل الإرسال: ${error.message}` : error.message, 'error');
      await Promise.all([loadDrafts(), loadHistory()]);
    } finally { if (button) button.disabled = false; }
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value); if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('ar-SA', { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
  }

  function statusLabel(status) { return status === 'sent' ? 'تم الإرسال' : status === 'failed' ? 'فشل الإرسال' : 'مسودة'; }
  function statusClass(status) { return status === 'sent' ? 'sent' : status === 'failed' ? 'failed' : 'draft'; }
  function renderEmpty(container, text) { container.innerHTML = `<div class="email-empty"><div class="email-empty-icon">✉</div><strong>${text}</strong></div>`; }
  function updateCounts() {
    root()?.querySelectorAll('[data-draft-count]').forEach(el => { el.textContent = String(state.drafts.length); });
    root()?.querySelectorAll('[data-history-count]').forEach(el => { el.textContent = String(state.history.length); });
  }

  function renderDrafts() {
    const container = qs('[data-drafts-list]'); if (!container) return;
    container.innerHTML = '';
    if (!state.drafts.length) { renderEmpty(container, 'لا توجد مسودات حاليًا'); updateCounts(); return; }
    state.drafts.forEach(draft => {
      const item = document.createElement('article'); item.className = 'email-list-item';
      item.innerHTML = `<div class="email-list-main"><div class="email-list-title"></div><div class="email-list-recipient"></div><div class="email-list-date"></div></div><div class="email-list-actions"><button type="button" class="email-secondary-btn" data-edit>تعديل</button><button type="button" class="email-danger-outline-btn" data-delete>حذف</button></div>`;
      item.querySelector('.email-list-title').textContent = draft.subject || '(بدون عنوان)';
      item.querySelector('.email-list-recipient').textContent = draft.recipient || '—';
      item.querySelector('.email-list-date').textContent = `آخر تعديل: ${formatDate(draft.updated_at || draft.created_at)}`;
      item.querySelector('[data-edit]').addEventListener('click', () => editDraft(draft));
      item.querySelector('[data-delete]').addEventListener('click', () => deleteEmail(draft, 'draft'));
      container.appendChild(item);
    });
    updateCounts();
  }

  function renderHistory() {
    const container = qs('[data-history-list]'); if (!container) return;
    container.innerHTML = '';
    if (!state.history.length) { renderEmpty(container, 'لا يوجد سجل إرسال حتى الآن'); updateCounts(); return; }
    state.history.forEach(email => {
      const item = document.createElement('article'); item.className = 'email-list-item';
      const retry = email.status === 'failed' ? '<button type="button" class="email-secondary-btn" data-retry>إعادة المحاولة</button>' : '';
      item.innerHTML = `<div class="email-list-main"><div class="email-list-title"></div><div class="email-list-recipient"></div><div class="email-list-date"></div></div><div class="email-list-side"><span class="email-status-badge ${statusClass(email.status)}"></span><div class="email-list-actions"><button type="button" class="email-secondary-btn" data-view>عرض</button>${retry}<button type="button" class="email-danger-outline-btn" data-delete>حذف</button></div></div>`;
      item.querySelector('.email-list-title').textContent = email.subject || '(بدون عنوان)';
      item.querySelector('.email-list-recipient').textContent = email.recipient || '—';
      item.querySelector('.email-list-date').textContent = `${formatDate(email.sent_at || email.updated_at || email.created_at)}`;
      item.querySelector('.email-status-badge').textContent = statusLabel(email.status);
      item.querySelector('[data-view]').addEventListener('click', () => openEmail(email));
      item.querySelector('[data-delete]').addEventListener('click', () => deleteEmail(email, 'history'));
      item.querySelector('[data-retry]')?.addEventListener('click', () => editDraft(email, true));
      container.appendChild(item);
    });
    updateCounts();
  }

  async function loadDrafts() {
    try { const result = await api('/api/admin-emails.js?status=draft'); state.drafts = result.emails || []; renderDrafts(); }
    catch (error) { const c = qs('[data-drafts-list]'); if (c) renderEmpty(c, error.message); }
  }

  async function loadHistory() {
    try { const result = await api('/api/admin-emails.js'); state.history = (result.emails || []).filter(email => email.status === 'sent' || email.status === 'failed'); renderHistory(); }
    catch (error) { const c = qs('[data-history-list]'); if (c) renderEmpty(c, error.message); }
  }

  async function deleteEmail(email, type) {
    const title = email.subject || 'هذه الرسالة';
    if (!window.confirm(`هل أنت متأكد من حذف ${type === 'draft' ? 'المسودة' : 'الرسالة'} «${title}» نهائيًا؟\nلا يمكن التراجع عن هذا الإجراء.`)) return;
    try {
      await api(`/api/admin-emails.js?id=${encodeURIComponent(email.id)}`, { method: 'DELETE' });
      if (state.editingDraftId === email.id) clearForm();
      if (type === 'draft') await loadDrafts(); else { await loadHistory(); closeModal(); }
    } catch (error) { window.alert(error.message); }
  }

  function openEmail(email) {
    state.currentViewId = email.id;
    qs('[data-view-subject]').textContent = email.subject || '(بدون عنوان)';
    const meta = qs('[data-view-meta]'); meta.innerHTML = '';
    [['المستلم', email.recipient || '—'],['التاريخ', formatDate(email.sent_at || email.updated_at || email.created_at)],['الحالة', statusLabel(email.status)]].forEach(([label,value]) => {
      const row = document.createElement('div'); row.className = 'email-meta-item'; row.innerHTML = '<span></span><strong></strong>'; row.querySelector('span').textContent = label; row.querySelector('strong').textContent = value; meta.appendChild(row);
    });
    qs('[data-view-content]').textContent = email.message || '';
    const errorBox = qs('[data-view-error]'); errorBox.hidden = email.status !== 'failed'; errorBox.textContent = email.error_message ? `سبب الفشل: ${email.error_message}` : '';
    const retry = qs('[data-view-retry]'); retry.hidden = email.status !== 'failed'; retry.onclick = email.status === 'failed' ? () => { closeModal(); editDraft(email, true); } : null;
    qs('[data-email-modal]').hidden = false;
  }

  function closeModal() { const modal = qs('[data-email-modal]'); if (modal) modal.hidden = true; state.currentViewId = null; }

  function switchTab(tab) {
    const container = root(); if (!container) return;
    container.querySelectorAll('[data-email-tab]').forEach(button => button.classList.toggle('active', button.dataset.emailTab === tab));
    container.querySelectorAll('[data-email-panel]').forEach(panel => { panel.hidden = panel.dataset.emailPanel !== tab; });
    if (tab === 'drafts') loadDrafts();
    if (tab === 'history') loadHistory();
  }

  function bind() {
    const container = root(); if (!container || container.dataset.emailBound === '1') return;
    container.dataset.emailBound = '1';
    container.querySelectorAll('[data-email-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.emailTab)));
    qs('[data-recipient-type]')?.addEventListener('change', setRecipientMode);
    qs('[data-save-draft]')?.addEventListener('click', saveDraft);
    qs('[data-clear-email]')?.addEventListener('click', () => clearForm());
    qs('[data-email-form]')?.addEventListener('submit', sendEmail);
    qs('[data-refresh-drafts]')?.addEventListener('click', loadDrafts);
    qs('[data-refresh-history]')?.addEventListener('click', loadHistory);
    container.querySelectorAll('[data-close-email-modal]').forEach(button => button.addEventListener('click', closeModal));
    qs('[data-view-delete]')?.addEventListener('click', async () => {
      if (!state.currentViewId) return;
      const email = state.history.find(item => item.id === state.currentViewId);
      if (email) await deleteEmail(email, 'history');
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
    populateRecipients(); setRecipientMode(); updateCounts(); loadDrafts(); loadHistory();
  }

  window.Maw3idEmailCenter = { init: bind, refresh: () => { populateRecipients(); loadDrafts(); loadHistory(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind); else bind();
})();
