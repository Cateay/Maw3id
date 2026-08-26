const EMAIL_STATUSES = ['draft', 'sent', 'failed'];

function getAdminPassword(req) {
  return req.headers['x-admin-password'] || req.headers['X-Admin-Password'];
}

function authenticate(req, res) {
  const expected = process.env.ADMIN_PASSWORD;
  const provided = getAdminPassword(req);
  if (!expected || !provided || provided !== expected) {
    res.status(401).json({ error: 'غير مصرح لك بالوصول إلى البريد.' });
    return false;
  }
  return true;
}

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = supabaseConfig();
  if (!url || !key) {
    const error = new Error('إعدادات قاعدة البيانات غير مكتملة.');
    error.status = 500;
    throw error;
  }
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
  if (!response.ok) {
    const error = new Error(data?.message || data?.hint || data?.details || 'تعذر الوصول إلى البريد.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function clean(value) { return String(value ?? '').trim(); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value)); }

function emailFields(body) {
  return {
    recipient: clean(body?.to || body?.recipient),
    subject: clean(body?.subject),
    message: clean(body?.message)
  };
}

function validateFields(fields) {
  if (!fields.recipient || !validEmail(fields.recipient)) return 'البريد الإلكتروني للمستلم غير صحيح.';
  if (!fields.subject) return 'عنوان الرسالة مطلوب.';
  if (!fields.message) return 'محتوى الرسالة مطلوب.';
  return '';
}

export default async function handler(req, res) {
  if (!authenticate(req, res)) return;

  try {
    if (req.method === 'GET') {
      const status = clean(req.query?.status);
      const params = new URLSearchParams({
        select: '*',
        order: 'created_at.desc'
      });
      if (status && EMAIL_STATUSES.includes(status)) params.set('status', `eq.${status}`);
      const emails = await supabaseRequest(`admin_emails?${params.toString()}`);
      return res.status(200).json({ emails: emails || [] });
    }

    if (req.method === 'POST') {
      const fields = emailFields(req.body);
      const error = validateFields(fields);
      if (error) return res.status(400).json({ error });

      const now = new Date().toISOString();
      const data = await supabaseRequest('admin_emails', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ ...fields, status: 'draft', updated_at: now })
      });
      return res.status(201).json({ success: true, draft: data?.[0] || null });
    }

    if (req.method === 'PATCH') {
      const id = clean(req.body?.id);
      if (!id) return res.status(400).json({ error: 'معرّف الرسالة مطلوب.' });
      const fields = emailFields(req.body);
      const error = validateFields(fields);
      if (error) return res.status(400).json({ error });

      const data = await supabaseRequest(
        `admin_emails?id=eq.${encodeURIComponent(id)}&status=eq.draft`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() })
        }
      );
      if (!data?.length) return res.status(404).json({ error: 'المسودة غير موجودة أو لم تعد مسودة.' });
      return res.status(200).json({ success: true, draft: data[0] });
    }

    if (req.method === 'DELETE') {
      const id = clean(req.body?.id || req.query?.id);
      if (!id) return res.status(400).json({ error: 'معرّف الرسالة مطلوب.' });
      await supabaseRequest(`admin_emails?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin emails error:', error);
    return res.status(error.status || 500).json({ error: error.message || 'حدث خطأ أثناء تنفيذ العملية.' });
  }
}
