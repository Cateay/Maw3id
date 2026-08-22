const {
  supabase,
  resend,
  cors,
  dateLabel,
  timeLabel
} = require('./_lib');

module.exports = async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {

    const adminPassword =
      req.headers['x-admin-password'];

    if (
      !process.env.ADMIN_PASSWORD ||
      adminPassword !== process.env.ADMIN_PASSWORD
    ) {
      return res.status(401).json({
        error: 'Unauthorized'
      });
    }

    const {
      booking_code
    } = req.body || {};

    if (!booking_code) {
      return res.status(400).json({
        error: 'رقم الحجز غير موجود'
      });
    }


    // جلب الحجز أولًا
    const {
      data: booking,
      error: findError
    } = await supabase()
      .from('bookings')
      .select(
        'id,booking_code,name,email,session_date,start_time,end_time,meeting_url'
      )
      .eq('booking_code', booking_code)
      .single();


    if (findError || !booking) {
      return res.status(404).json({
        error: 'الحجز غير موجود'
      });
    }


    // حذف الحجز
    const {
      error: deleteError
    } = await supabase()
      .from('bookings')
      .delete()
      .eq('booking_code', booking_code);


    if (deleteError) {
      console.error(deleteError);

      return res.status(500).json({
        error: 'تعذر إلغاء الموعد'
      });
    }


    // إرسال إيميل للعميل
    if (resend() && booking.email) {

      const html = `
        <div
          dir="rtl"
          style="
            font-family:Arial,sans-serif;
            line-height:1.8;
            color:#172033;
            max-width:600px;
            margin:auto;
          "
        >

          <h2>
            مَوعد | Maw3id
          </h2>

          <p>
            مرحبًا ${booking.name || ''}،
          </p>

          <p>
            نود إبلاغك بأنه تم إلغاء موعد جلستك.
          </p>

          <p>
            <b>التاريخ:</b>
            ${dateLabel(booking.session_date)}
            <br>

            <b>الوقت:</b>
            ${timeLabel(booking.start_time)}
            –
            ${timeLabel(booking.end_time)}
            <br>

            <b>رقم الحجز:</b>
            ${booking.booking_code}
          </p>

          <p>
            يمكنك العودة إلى مَوعد واختيار موعد آخر متاح.
          </p>

          <p>
            <a
              href="${process.env.APP_URL}"
              style="
                display:inline-block;
                background:#172033;
                color:white;
                padding:10px 18px;
                border-radius:8px;
                text-decoration:none;
              "
            >
              حجز موعد جديد
            </a>
          </p>

          <p style="color:#777;font-size:13px">
            نعتذر عن أي إزعاج.
          </p>

        </div>
      `;


      await resend().emails.send({
        from: 'Maw3id <noreply@maw3id.online>',
        to: booking.email,
        subject: `إلغاء موعد مَوعد — ${dateLabel(booking.session_date)}`,
        html
      });

    }


    return res.status(200).json({
      success: true,
      message: 'تم إلغاء الموعد وإرسال الإشعار'
    });


  } catch (e) {

    console.error(e);

    return res.status(500).json({
      error: 'حدث خطأ أثناء إلغاء الموعد'
    });

  }
};
