const {
  supabase,
  resend,
  cors,
  dateLabel,
  timeLabel,
  meetingUrl,
  code
} = require('./_lib');

module.exports = async (req, res) => {
  cors(res);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let { name, email, notes, date, startTime } = req.body || {};

    name = String(name || '').trim();
    email = String(email || '').trim().toLowerCase();
    notes = String(notes || '').trim();
    date = String(date || '').trim();
    startTime = String(startTime || '').trim();

    if (!name || !email || !date || !startTime) {
      return res.status(400).json({ error: 'أكملي البيانات المطلوبة' });
    }

    if (name.length > 120 || email.length > 254 || notes.length > 2000) {
      return res.status(400).json({ error: 'البيانات المدخلة طويلة جدًا' });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'البريد الإلكتروني غير صحيح' });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'التاريخ غير صحيح' });
    }

    if (!/^\d{2}:\d{2}$/.test(startTime)) {
      return res.status(400).json({ error: 'الوقت غير صحيح' });
    }

    const [h, m] = startTime.split(':').map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || ![0, 30].includes(m)) {
      return res.status(400).json({ error: 'الوقت غير صحيح' });
    }

    const endM = h * 60 + m + 120;
    if (endM > 24 * 60) {
      return res.status(400).json({ error: 'مدة الجلسة تتجاوز نهاية اليوم' });
    }

    const end = `${String(Math.floor(endM / 60)).padStart(2, '0')}:${String(endM % 60).padStart(2, '0')}`;
    const start = new Date(`${date}T${startTime}:00+03:00`);

    if (Number.isNaN(start.getTime()) || start <= new Date()) {
      return res.status(400).json({ error: 'هذا الموعد انتهى أو غير صحيح' });
    }

    const c = code();
    const url = meetingUrl(c);

    const { data, error } = await supabase()
      .from('bookings')
      .insert({
        booking_code: c,
        name,
        email,
        session_date: date,
        start_time: startTime,
        end_time: end,
        meeting_url: url,
        notes: notes || null
      })
      .select('*')
      .single();

    if (error) {
      console.error('Booking DB error:', error);
      return res.status(500).json({ error: 'حدث خطأ أثناء الحجز' });
    }

    const subject = `تأكيد جلسة مَوعد — ${dateLabel(date)}`;
    const safeName = escapeHTML(name);
    const safeUrl = escapeHTML(url);
    const safeCode = escapeHTML(c);
    const appUrl = String(process.env.APP_URL || '').replace(/\/$/, '');
    const confirmUrl = `${appUrl}/api/respond?code=${encodeURIComponent(c)}&status=confirmed`;
    const declineUrl = `${appUrl}/api/respond?code=${encodeURIComponent(c)}&status=declined`;

    if (resend()) {
      const customerHtml = `
        <div dir="rtl" style="font-family:Arial;line-height:1.8">
          <h2>مَوعد | Maw3id</h2>
          <p>مرحبًا ${safeName}، تم حجز جلستك بنجاح.</p>
          <p><b>التاريخ:</b> ${escapeHTML(dateLabel(date))}<br><b>الوقت:</b> ${escapeHTML(timeLabel(startTime))} – ${escapeHTML(timeLabel(end))}<br><b>المدة:</b> ساعتان</p>
          <p><a href="${safeUrl}">دخول الجلسة</a></p>
          <p><a href="${escapeHTML(confirmUrl)}">تأكيد الحضور</a> &nbsp; <a href="${escapeHTML(declineUrl)}">لن أتمكن من الحضور</a></p>
          <p>رقم الحجز: ${safeCode}</p>
        </div>`;

      try {
        await resend().emails.send({
          from: 'Maw3id <noreply@maw3id.online>',
          to: email,
          subject,
          html: customerHtml
        });

        await resend().emails.send({
          from: 'Maw3id <noreply@maw3id.online>',
          to: process.env.ADMIN_EMAIL,
          subject: `حجز جلسة جديدة — ${name}`,
          html: `
            <div dir="rtl" style="font-family:Arial;line-height:1.8">
              <h2>حجز جلسة جديدة</h2>
              <p><b>الاسم:</b> ${safeName}<br><b>البريد:</b> ${escapeHTML(email)}<br><b>التاريخ:</b> ${escapeHTML(dateLabel(date))}<br><b>الوقت:</b> ${escapeHTML(timeLabel(startTime))} – ${escapeHTML(timeLabel(end))}<br><b>المدة:</b> ساعتان<br><b>رقم الحجز:</b> ${safeCode}</p>
              <p><b>رابط الجلسة:</b> <a href="${safeUrl}">${safeUrl}</a></p>
            </div>`
        });
      } catch (emailError) {
        console.error('Booking email error:', emailError);
      }
    }

    return res.status(201).json({
      name,
      dateLabel: dateLabel(date),
      startLabel: timeLabel(startTime),
      endLabel: timeLabel(end),
      meetingUrl: url,
      bookingCode: c
    });
  } catch (e) {
    console.error('Booking unexpected error:', e);
    return res.status(500).json({ error: 'حدث خطأ أثناء الحجز' });
  }
};

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
