const { supabase } = require('./_lib');

const STATUSES = ['draft', 'sent'];

function auth(req) {
  return process.env.ADMIN_PASSWORD && req.headers['x-admin-password'] === process.env.ADMIN_PASSWORD;
}

function clean(value) {
  return String(value ?? '').trim();
}

function draftData(body) {
  const recipient = clean(body?.to || body?.recipient);
  const subject = clean(body?.subject);
  const message = clean(body?.message);

  if (recipient && !/^\S+@\S+\.\S+$/.test(recipient)) {
    return { error: 'البريد الإلكتروني للمستلم غير صحيح.' };
  }
  if (recipient.length > 254 || subject.length > 300 || message.length > 20000) {
    return { error: 'البيانات المدخلة طويلة جدًا.' };
  }

  return { recipient: recipient || null, subject: subject || null, message: message || null };
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (!auth(req)) return res.status(401).json({ error: 'غير مصرح لك بالوصول إلى البريد.' });

  try {
    if (req.method === 'GET') {
      const status = clean(req.query?.status);
      let query = supabase().from('admin_emails').select('*').order('created_at', { ascending: false });
      if (STATUSES.includes(status)) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ emails: data || [] });
    }

    if (req.method === 'POST') {
      const draft = draftData(req.body || {});
      if (draft.error) return res.status(400).json({ error: draft.error });

      const { data, error } = await supabase()
        .from('admin_emails')
        .insert({ ...draft, status: 'draft' })
        .select('*')
        .single();

      if (error) throw error;
      return res.status(201).json({ success: true, draft: data });
    }

    if (req.method === 'PATCH') {
      const id = clean(req.body?.id);
      if (!id) return res.status(400).json({ error: 'معرّف المسودة مطلوب.' });

      const draft = draftData(req.body || {});
      if (draft.error) return res.status(400).json({ error: draft.error });

      const { data, error } = await supabase()
        .from('admin_emails')
        .update({ ...draft, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'draft')
        .select('*');

      if (error) throw error;
      if (!data?.length) return res.status(404).json({ error: 'المسودة غير موجودة أو لم تعد مسودة.' });
      return res.status(200).json({ success: true, draft: data[0] });
    }

    if (req.method === 'DELETE') {
      const id = clean(req.body?.id || req.query?.id);
      if (!id) return res.status(400).json({ error: 'معرّف الرسالة مطلوب.' });

      const { error } = await supabase().from('admin_emails').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Admin emails error:', error);
    return res.status(500).json({ error: 'حدث خطأ أثناء إدارة البريد.' });
  }
};
