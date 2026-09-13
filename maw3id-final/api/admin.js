const { supabase } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const providedPassword = req.headers['x-admin-password'];

  if (!process.env.ADMIN_PASSWORD || providedPassword !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { data, error } = await supabase()
    .from('bookings')
    .select('id,name,email,session_date,start_time,end_time,attendance_status,booking_code,meeting_url,created_at,notes')
    .order('session_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Admin bookings error:', error);
    return res.status(500).json({ error: 'تعذر تحميل الحجوزات' });
  }

  return res.json({ bookings: data || [] });
};
