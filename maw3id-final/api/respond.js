const { supabase } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (req.method !== 'GET') {
    return res.status(405).send('طلب غير صحيح');
  }

  const code = String(req.query?.code || '').trim();
  const status = String(req.query?.status || '').trim();

  if (!/^[A-Za-z0-9_-]{4,80}$/.test(code) || !['confirmed', 'declined'].includes(status)) {
    return res.status(400).send('طلب غير صحيح');
  }

  const { data: booking, error: findError } = await supabase()
    .from('bookings')
    .select('id,attendance_status')
    .eq('booking_code', code)
    .maybeSingle();

  if (findError) {
    console.error('Respond lookup error:', findError);
    return res.status(500).send('تعذر تحديث الحضور');
  }

  if (!booking) {
    return res.status(404).send('الحجز غير موجود أو تم إلغاؤه');
  }

  const { error } = await supabase()
    .from('bookings')
    .update({
      attendance_status: status,
      confirmed_at: status === 'confirmed' ? new Date().toISOString() : null
    })
    .eq('id', booking.id);

  if (error) {
    console.error('Respond update error:', error);
    return res.status(500).send('تعذر تحديث الحضور');
  }

  const title = status === 'confirmed' ? 'تم تأكيد حضورك ✓' : 'تم تسجيل عدم الحضور';
  const message = status === 'confirmed' ? 'تم تحديث حالة الحجز بنجاح.' : 'تم تحديث حالة الحجز إلى عدم الحضور.';

  return res.status(200).send(`
    <html lang="ar" dir="rtl">
      <meta name="viewport" content="width=device-width">
      <meta name="referrer" content="no-referrer">
      <body style="font-family:Arial;text-align:center;padding:60px">
        <h2>${title}</h2>
        <p>${message}</p>
        <p>يمكنك إغلاق هذه الصفحة.</p>
      </body>
    </html>
  `);
};
