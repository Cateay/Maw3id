const { supabase } = require('./_lib');

module.exports = async (req, res) => {

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method Not Allowed'
    });
  }

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

  const { booking_code, status } = req.body || {};

  if (
    !booking_code ||
    !['confirmed', 'declined'].includes(status)
  ) {
    return res.status(400).json({
      error: 'طلب غير صحيح'
    });
  }

  const { error } = await supabase()
    .from('bookings')
    .update({
      attendance_status: status,
      confirmed_at:
        status === 'confirmed'
          ? new Date().toISOString()
          : null
    })
    .eq('booking_code', booking_code);

  if (error) {
    return res.status(500).json({
      error: 'تعذر تحديث حالة الحضور'
    });
  }

  return res.status(200).json({
    success: true,
    status
  });
};
