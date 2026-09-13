const { supabase } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (!process.env.ADMIN_PASSWORD || req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const bookingCode = String(req.body?.booking_code || '').trim();
  const status = String(req.body?.status || '').trim();

  if (!/^[A-Za-z0-9_-]{4,80}$/.test(bookingCode) || !['confirmed', 'declined'].includes(status)) {
    return res.status(400).json({ error: 'طلب غير صحيح' });
  }

  const { data, error } = await supabase()
    .from('bookings')
    .update({ attendance_status: status, confirmed_at: status === 'confirmed' ? new Date().toISOString() : null })
    .eq('booking_code', bookingCode)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Admin status error:', error);
    return res.status(500).json({ error: 'تعذر تحديث حالة الحضور' });
  }

  if (!data) return res.status(404).json({ error: 'الحجز غير موجود' });

  return res.status(200).json({ success: true, status });
};
