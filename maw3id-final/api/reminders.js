const { supabase, resend, dateLabel, timeLabel } = require('./_lib');

module.exports = async (req, res) => {
  if (
    req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}` &&
    process.env.CRON_SECRET
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date();
  const from = new Date(now.getTime() + 25 * 60 * 1000);
  const to = new Date(now.getTime() + 35 * 60 * 1000);

  const today = now.toISOString().slice(0, 10);

  const { data, error } = await supabase()
    .from('bookings')
    .select('*')
    .in('attendance_status', ['pending', 'confirmed'])
    .eq('session_date', today)
    .is('reminder_sent_at', null);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'db' });
  }

  let sent = 0;

  for (const b of data || []) {
    const start = new Date(
      `${b.session_date}T${String(b.start_time).slice(0, 5)}:00+03:00`
    );

    const diff = start.getTime() - now.getTime();

    // إرسال التذكير إذا كانت الجلسة بعد 25–35 دقيقة
    if (diff >= 25 * 60 * 1000 && diff <= 35 * 60 * 1000) {
      if (!resend()) continue;

      await resend().emails.send({
        from: 'Maw3id <onboarding@resend.dev>',
        to: b.email,
        subject: 'تذكير بجلسة مَوعد',
        html: `
          <div dir="rtl" style="font-family:Arial;line-height:1.8">
            <h2>تذكير بجلسة مَوعد</h2>
            <p>
              جلستك ستكون بعد 30 دقيقة.
            </p>
            <p>
              <b>التاريخ:</b> ${dateLabel(b.session_date)}<br>
              <b>الوقت:</b> ${timeLabel(String(b.start_time).slice(0, 5))}
            </p>
            <p>
              <a href="${b.meeting_url}">دخول الجلسة</a>
            </p>
          </div>
        `
      });

      await supabase()
        .from('bookings')
        .update({
          reminder_sent_at: new Date().toISOString()
        })
        .eq('id', b.id);

      sent++;
    }
  }

  return res.json({ sent });
};
