const { supabase, cors } = require('./_lib');

module.exports = async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const date = String(req.query?.date || '');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'تاريخ غير صحيح' });
  }

  const { data, error } = await supabase()
    .from('bookings')
    .select('start_time,end_time')
    .eq('session_date', date)
    .neq('attendance_status', 'declined');

  if (error) {
    console.error('Slots error:', error);
    return res.status(500).json({ error: 'تعذر تحميل المواعيد' });
  }

  const bookings = data || [];

  const toMinutes = (value) => {
    const [h, m] = String(value).slice(0, 5).split(':').map(Number);
    return h * 60 + m;
  };

  const taken = [];

  // The public booking page offers 30-minute starts from 08:00 to 20:00.
  // A slot is blocked only when its 2-hour interval actually overlaps
  // an existing active booking. Adjacent sessions remain available.
  for (let start = 8 * 60; start <= 20 * 60; start += 30) {
    const end = start + 120;

    const overlaps = bookings.some((booking) => {
      const bookedStart = toMinutes(booking.start_time);
      const bookedEnd = toMinutes(booking.end_time);
      return start < bookedEnd && end > bookedStart;
    });

    if (overlaps) {
      taken.push(
        `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`
      );
    }
  }

  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.json({ taken });
};
