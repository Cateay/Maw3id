const {
  supabase,
  resend,
  cors,
  dateLabel,
  timeLabel
} = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!process.env.ADMIN_PASSWORD || req.headers['x-admin-password'] !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const bookingCode = String(req.body?.booking_code || '').trim();
    if (!/^[A-Za-z0-9_-]{4,80}$/.test(bookingCode)) {
      return res.status(400).json({ error: 'رقم الحجز غير صحيح' });
    }

    const { data: booking, error: findError } = await supabase()
      .from('bookings')
      .select('id,booking_code,name,email,session_date,start_time,end_time,meeting_url')
      .eq('booking_code', bookingCode)
      .maybeSingle();

    if (findError) {
      console.error('Find booking error:', findError);
      return res.status(500).json({ error: 'تعذر العثور على الحجز' });
    }

    if (!booking) return res.status(404).json({ error: 'الحجز غير موجود' });

    const { error: deleteError } = await supabase()
      .from('bookings')
      .delete()
      .eq('id', booking.id);

    if (deleteError) {
      console.error('Delete booking error:', deleteError);
      return res.status(500).json({ error: 'تعذر إلغاء الحجز' });
    }

    let emailSent = false;

    if (resend() && booking.email) {
      try {
        const html = `
          <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.8;color:#172033;max-width:600px;margin:auto">
            <h2>مَوعد | Maw3id</h2>
            <p>مرحبًا ${escapeHTML(booking.name || '')}،</p>
            <p>نود إبلاغك بأنه تم إلغاء موعد جلستك.</p>
            <p><b>التاريخ:</b> ${escapeHTML(dateLabel(booking.session_date))}<br><b>الوقت:</b> ${escapeHTML(timeLabel(booking.start_time))} – ${escapeHTML(timeLabel(booking.end_time))}<br><b>رقم الحجز:</b> ${escapeHTML(booking.booking_code)}</p>
            <p>يمكنك العودة إلى مَوعد واختيار موعد آخر متاح.</p>
            <p><a href="${escapeHTML(process.env.APP_URL || '')}" style="display:inline-block;background:#172033;color:white;padding:10px 18px;border-radius:8px;text-decoration:none">حجز موعد جديد</a></p>
          </div>`;

        await resend().emails.send({
          from: 'Maw3id <noreply@maw3id.online>',
          to: booking.email,
          subject: `إلغاء موعد مَوعد — ${dateLabel(booking.session_date)}`,
          html
        });
        emailSent = true;
      } catch (emailError) {
        console.error('Cancellation email error:', emailError);
      }
    }

    return res.status(200).json({
      success: true,
      deleted: true,
      emailSent,
      message: emailSent ? 'تم إلغاء الموعد وإرسال الإشعار' : 'تم إلغاء الموعد'
    });
  } catch (e) {
    console.error('Cancel unexpected error:', e);
    return res.status(500).json({ error: 'حدث خطأ أثناء إلغاء الموعد' });
  }
};

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
