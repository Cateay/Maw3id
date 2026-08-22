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

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let {
      name,
      email,
      notes,
      date,
      startTime
    } = req.body || {};

    if (!name || !email || !date || !startTime) {
      return res.status(400).json({
        error: 'أكملي البيانات المطلوبة'
      });
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({
        error: 'البريد الإلكتروني غير صحيح'
      });
    }

    let [h, m] = startTime.split(':').map(Number);

    let endM = h * 60 + m + 120;

    let end = `${String(Math.floor(endM / 60)).padStart(2, '0')}:${String(endM % 60).padStart(2, '0')}`;

    let now = new Date();

    let start = new Date(
      `${date}T${startTime}:00+03:00`
    );

    if (start <= now) {
      return res.status(400).json({
        error: 'هذا الموعد انتهى'
      });
    }

    let c = code();
    let url = meetingUrl(c);

    let {
      data,
      error
    } = await supabase()
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
      if (error.code === '23505') {
        return res.status(409).json({
          error: 'هذا الموعد حُجز للتو، اختاري موعدًا آخر'
        });
      }

      throw error;
    }

    let subject = `تأكيد جلسة مَوعد — ${dateLabel(date)}`;

    if (resend()) {
      let html = `
        <div dir="rtl" style="font-family:Arial;line-height:1.8">
          <h2>مَوعد | Maw3id</h2>

          <p>تم حجز جلستك بنجاح.</p>

          <p>
            <b>التاريخ:</b> ${dateLabel(date)}<br>
            <b>الوقت:</b> ${timeLabel(startTime)} – ${timeLabel(end)}<br>
            <b>المدة:</b> ساعتان
          </p>

          <p>
            <a href="${url}">دخول الجلسة</a>
          </p>

          <p>
            <a href="${process.env.APP_URL}/api/respond?code=${c}&status=confirmed">
              تأكيد الحضور
            </a>
            &nbsp;
            <a href="${process.env.APP_URL}/api/respond?code=${c}&status=declined">
              لن أتمكن من الحضور
            </a>
          </p>

          <p>رقم الحجز: ${c}</p>
        </div>
      `;

      // إرسال تأكيد الحجز للعميل
      await resend().emails.send({
        from: 'Maw3id <noreply@maw3id.online>',
        to: email,
        subject,
        html
      });

      // إرسال إشعار حجز جديد للإدمن
      await resend().emails.send({
        from: 'Maw3id <noreply@maw3id.online>',
        to: process.env.ADMIN_EMAIL || 'Eithar.012@gmail.com',
        subject: 'حجز جلسة جديدة — ' + name,
        html: html
          .replace(
            'تم حجز جلستك بنجاح.',
            'تم حجز جلسة جديدة.'
          )
          .replace(
            /تأكيد الحضور[\s\S]*/,
            ''
          )
      });
    }

    res.status(201).json({
      name,
      dateLabel: dateLabel(date),
      startLabel: timeLabel(startTime),
      endLabel: timeLabel(end),
      meetingUrl: url,
      bookingCode: c
    });

  } catch (e) {
    console.error(e);

    res.status(500).json({
      error: 'حدث خطأ أثناء الحجز'
    });
  }
};
