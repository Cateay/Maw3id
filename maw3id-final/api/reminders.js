const {
  supabase,
  resend,
  dateLabel,
  timeLabel
} = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.CRON_SECRET || req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date();
  const saudiNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
  const today = `${saudiNow.getFullYear()}-${String(saudiNow.getMonth() + 1).padStart(2, '0')}-${String(saudiNow.getDate()).padStart(2, '0')}`;

  const { data, error } = await supabase()
    .from('bookings')
    .select('*')
    .in('attendance_status', ['pending', 'confirmed'])
    .eq('session_date', today)
    .is('reminder_sent_at', null);

  if (error) {
    console.error('Reminder DB error:', error);
    return res.status(500).json({ error: 'تعذر تحميل التذكيرات' });
  }

  let sent = 0;

  for (const b of data || []) {
    const start = new Date(`${b.session_date}T${String(b.start_time).slice(0, 5)}:00+03:00`);
    const diff = start.getTime() - saudiNow.getTime();

    if (diff < 25 * 60 * 1000 || diff > 35 * 60 * 1000) continue;

    const mailer = resend();
    if (!mailer || !b.email) continue;

    const { error: emailError } = await mailer.emails.send({
      from: 'Maw3id <noreply@maw3id.online>',
      to: b.email,
      subject: 'تذكير بجلسة مَوعد',
      html: `
        <div dir="rtl" style="font-family:Arial;line-height:1.8">
          <h2>تذكير بجلسة مَوعد</h2>
          <p>جلستك ستكون بعد 30 دقيقة.</p>
          <p><b>التاريخ:</b> ${escapeHTML(dateLabel(b.session_date))}<br><b>الوقت:</b> ${escapeHTML(timeLabel(String(b.start_time).slice(0, 5)))}</p>
          <p><a href="${escapeHTML(b.meeting_url || '')}">دخول الجلسة</a></p>
        </div>
      `
    });

    if (emailError) {
      console.error('Failed to send reminder:', emailError);
      continue;
    }

    const { error: updateError } = await supabase()
      .from('bookings')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', b.id)
      .is('reminder_sent_at', null);

    if (updateError) {
      console.error('Failed to mark reminder as sent:', updateError);
      continue;
    }

    sent++;
  }

  return res.json({ sent });
};

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
