const { supabase } = require('./_lib');

module.exports = async (req, res) => {

  if (
    !process.env.ADMIN_PASSWORD ||
    req.query.password !== process.env.ADMIN_PASSWORD
  ) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  let { data, error } = await supabase()
    .from('bookings')
    .select(
      'id,name,email,session_date,start_time,end_time,attendance_status,booking_code,meeting_url,created_at,notes'
    )
    .order('session_date', {
      ascending: true
    })
    .order('start_time', {
      ascending: true
    });

  if (error) {
    return res.status(500).json({
      error: 'db'
    });
  }

  res.json({
    bookings: data || []
  });
};
