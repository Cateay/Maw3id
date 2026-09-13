const { supabase, resend } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ADMIN_PASSWORD || req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'غير مصرح لك بإرسال البريد.' });

  const to = String(req.body?.to || '').trim();
  const subject = String(req.body?.subject || '').trim();
  const message = String(req.body?.message || '').trim();
  const draftId = String(req.body?.draft_id || '').trim();
  if (!to || !/^\S+@\S+\.\S+$/.test(to)) return res.status(400).json({ error: 'البريد الإلكتروني للمستلم غير صحيح.' });
  if (!subject || !message) return res.status(400).json({ error: 'عنوان الرسالة ونصها مطلوبان.' });
  if (to.length > 254 || subject.length > 300 || message.length > 20000) return res.status(400).json({ error: 'البيانات المدخلة طويلة جدًا.' });

  const mailer = resend();
  if (!mailer) return res.status(500).json({ error: 'إعدادات البريد غير مكتملة.' });

  try {
    const result = await mailer.emails.send({
      from: 'Maw3id <noreply@maw3id.online>',
      to,
      subject,
      text: message,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#172033;white-space:pre-line">${escapeHTML(message)}</div>`
    });
    const resendId = result?.data?.id || result?.id || null;
    try {
      if (draftId) {
        await supabase().from('admin_emails').update({ recipient: to, subject, message, status: 'sent', resend_id: resendId, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', draftId).eq('status', 'draft');
      } else {
        await supabase().from('admin_emails').insert({ recipient: to, subject, message, status: 'sent', resend_id: resendId, sent_at: new Date().toISOString() });
      }
    } catch (logError) { console.error('Email history logging error:', logError); }
    return res.status(200).json({ success: true, message: 'تم إرسال البريد بنجاح.', id: resendId });
  } catch (error) {
    console.error('Admin email error:', error);
    return res.status(500).json({ error: 'تعذر إرسال البريد.' });
  }
};

function escapeHTML(value) { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
