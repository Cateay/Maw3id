function getSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) throw new Error('Supabase environment variables are missing');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.hint || data?.details || 'تعذر تحديث سجل البريد.');
  return data;
}

function clean(value) { return String(value ?? '').trim(); }
function validateEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(email)); }

async function recordResult({ id, recipient, subject, message, status, resendId = null, errorMessage = null, sentAt = null }) {
  const now = new Date().toISOString();
  const record = {
    recipient,
    subject,
    message,
    status,
    resend_id: resendId,
    error_message: errorMessage,
    sent_at: sentAt,
    updated_at: now
  };

  if (id) {
    const updated = await supabaseRequest(
      `admin_emails?id=eq.${encodeURIComponent(id)}&status=in.(draft,failed)`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(record)
      }
    );
    if (updated?.length) return updated[0];
  }

  const inserted = await supabaseRequest('admin_emails', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ...record, created_at: now })
  });
  return inserted?.[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const adminPassword = process.env.ADMIN_PASSWORD;
  const providedPassword = req.headers['x-admin-password'] || req.headers['X-Admin-Password'];
  if (!adminPassword || !providedPassword || providedPassword !== adminPassword) {
    return res.status(401).json({ error: 'غير مصرح لك بإرسال البريد.' });
  }

  const recipient = clean(req.body?.to);
  const subject = clean(req.body?.subject);
  const message = clean(req.body?.message);
  const emailId = clean(req.body?.draft_id) || null;

  if (!recipient || !validateEmail(recipient)) return res.status(400).json({ error: 'البريد الإلكتروني للمستلم غير صحيح.' });
  if (!subject) return res.status(400).json({ error: 'عنوان الرسالة مطلوب.' });
  if (!message) return res.status(400).json({ error: 'نص الرسالة مطلوب.' });

  const resendApiKey = process.env.RESEND_API_KEY;
  if (!resendApiKey) return res.status(500).json({ error: 'إعدادات البريد غير مكتملة.' });

  const from = 'Maw3id <noreply@maw3id.online>';
  let resendResponse;

  try {
    resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from,
        to: [recipient],
        subject,
        text: message,
        html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#172033;white-space:pre-line;">${escapeHTML(message)}</div>`
      })
    });
  } catch (networkError) {
    const reason = networkError?.message || 'تعذر الاتصال بخدمة Resend.';
    try { await recordResult({ id: emailId, recipient, subject, message, status: 'failed', errorMessage: reason }); }
    catch (dbError) { console.error('Failed to log Resend network failure:', dbError); }
    return res.status(502).json({ error: reason, status: 'failed' });
  }

  const data = await resendResponse.json().catch(() => ({}));

  if (!resendResponse.ok) {
    const reason = data?.message || data?.error || `Resend HTTP ${resendResponse.status}`;
    try {
      await recordResult({ id: emailId, recipient, subject, message, status: 'failed', errorMessage: reason });
    } catch (dbError) {
      console.error('Resend failed and failure could not be logged:', dbError);
    }
    return res.status(resendResponse.status >= 400 && resendResponse.status < 600 ? resendResponse.status : 500).json({
      error: reason,
      status: 'failed'
    });
  }

  const sentAt = new Date().toISOString();
  try {
    await recordResult({
      id: emailId,
      recipient,
      subject,
      message,
      status: 'sent',
      resendId: data.id || null,
      sentAt
    });
  } catch (logError) {
    console.error('Email sent but history could not be saved:', logError);
    return res.status(500).json({
      error: 'تم قبول البريد من Resend، لكن تعذر حفظه في سجل الإرسال. لا تعِد الإرسال حتى لا يتكرر البريد.',
      status: 'sent_unlogged',
      id: data.id || null
    });
  }

  return res.status(200).json({ success: true, message: 'تم إرسال البريد بنجاح.', id: data.id || null, status: 'sent' });
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
