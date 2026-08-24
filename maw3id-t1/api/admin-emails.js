const EMAIL_STATUSES = ['draft', 'sent'];

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

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  return { url, key };
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = getSupabaseConfig();

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

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const error = new Error(
      data?.message ||
      data?.hint ||
      data?.details ||
      'تعذر الوصول إلى البريد.'
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function clean(value) {
  return String(value ?? '').trim();
}

function validateSendMessage(body) {
  const recipient = clean(body?.to || body?.recipient);
  const subject = clean(body?.subject);
  const message = clean(body?.message);

  if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return { error: 'البريد الإلكتروني للمستلم غير صحيح.' };
  }

  if (!subject) return { error: 'عنوان الرسالة مطلوب.' };
  if (!message) return { error: 'محتوى الرسالة مطلوب.' };

  return { recipient, subject, message };
}

function getDraftData(body) {
  return {
    recipient: clean(body?.to || body?.recipient) || null,
    subject: clean(body?.subject) || null,
    message: clean(body?.message) || null
  };
}

export default async function handler(req, res) {
  if (!authenticate(req, res)) return;

  try {
    if (req.method === 'GET') {
      const status = req.query?.status;
      const params = new URLSearchParams();

      params.set('select', '*');
      params.set('order', 'created_at.desc');

      if (status && EMAIL_STATUSES.includes(status)) {
        params.set('status', `eq.${status}`);
      }

      const data = await supabaseRequest(
        `admin_emails?${params.toString()}`
      );

      return res.status(200).json({
        emails: data || []
      });
    }

    if (req.method === 'POST') {
      const draft = getDraftData(req.body || {});

      const data = await supabaseRequest('admin_emails', {
        method: 'POST',
        headers: {
          Prefer: 'return=representation'
        },
        body: JSON.stringify({
          ...draft,
          status: 'draft'
        })
      });

      return res.status(201).json({
        success: true,
        draft: data?.[0] || null
      });
    }

    if (req.method === 'PATCH') {
      const id = clean(req.body?.id);

      if (!id) {
        return res.status(400).json({
          error: 'معرّف المسودة مطلوب.'
        });
      }

      const draft = getDraftData(req.body || {});

      const data = await supabaseRequest(
        `admin_emails?id=eq.${encodeURIComponent(id)}&status=eq.draft`,
        {
          method: 'PATCH',
          headers: {
            Prefer: 'return=representation'
          },
          body: JSON.stringify({
            ...draft,
            updated_at: new Date().toISOString()
          })
        }
      );

      if (!data?.length) {
        return res.status(404).json({
          error: 'المسودة غير موجودة أو لم تعد مسودة.'
        });
      }

      return res.status(200).json({
        success: true,
        draft: data[0]
      });
    }

    if (req.method === 'DELETE') {
      const id = clean(req.body?.id || req.query?.id);

      if (!id) {
        return res.status(400).json({
          error: 'معرّف الرسالة مطلوب.'
        });
      }

      await supabaseRequest(
        `admin_emails?id=eq.${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          headers: {
            Prefer: 'return=minimal'
          }
        }
      );

      return res.status(200).json({
        success: true
      });
    }

    return res.status(405).json({
      error: 'Method not allowed'
    });
  } catch (error) {
    console.error('Admin emails error:', error);

    return res.status(error.status || 500).json({
      error:
        error.message ||
        'حدث خطأ أثناء تنفيذ العملية.'
    });
  }
}
