export default async function handler(req, res) {
  // =========================
  // Allow POST only
  // =========================

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    // =========================
    // Admin authentication
    // =========================

    const adminPassword =
      process.env.ADMIN_PASSWORD;

    const providedPassword =
      req.headers['x-admin-password'];

    if (
      !adminPassword ||
      !providedPassword ||
      providedPassword !== adminPassword
    ) {
      return res.status(401).json({
        error: 'غير مصرح لك بحفظ المسودة.'
      });
    }

    // =========================
    // Request data
    // =========================

    const {
      to,
      subject,
      message
    } = req.body || {};

    if (!to) {
      return res.status(400).json({
        error: 'البريد الإلكتروني للمستلم مطلوب.'
      });
    }

    if (!subject) {
      return res.status(400).json({
        error: 'عنوان الرسالة مطلوب.'
      });
    }

    if (!message) {
      return res.status(400).json({
        error: 'نص الرسالة مطلوب.'
      });
    }

    // =========================
    // Email validation
    // =========================

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(to)) {
      return res.status(400).json({
        error: 'البريد الإلكتروني غير صحيح.'
      });
    }

    // =========================
    // Supabase configuration
    // =========================

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseServiceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
      !supabaseUrl ||
      !supabaseServiceRoleKey
    ) {
      console.error(
        'Supabase environment variables are missing'
      );

      return res.status(500).json({
        error: 'إعدادات قاعدة البيانات غير مكتملة.'
      });
    }

    // =========================
    // Save draft
    // =========================

    const response =
      await fetch(
        `${supabaseUrl}/rest/v1/admin_emails`,
        {
          method: 'POST',

          headers: {
            'apikey':
              supabaseServiceRoleKey,

            'Authorization':
              `Bearer ${supabaseServiceRoleKey}`,

            'Content-Type':
              'application/json',

            'Prefer':
              'return=representation'
          },

          body: JSON.stringify({
            recipient: to,
            subject: subject,
            message: message,
            status: 'draft'
          })
        }
      );

    const data =
      await response.json();

    // =========================
    // Supabase error
    // =========================

    if (!response.ok) {
      console.error(
        'Supabase draft error:',
        data
      );

      return res.status(
        response.status
      ).json({
        error:
          data?.message ||
          data?.hint ||
          'تعذر حفظ المسودة.'
      });
    }

    // =========================
    // Success
    // =========================

    return res.status(200).json({
      success: true,
      message: 'تم حفظ المسودة بنجاح.',
      draft: data?.[0] || null
    });

  } catch (error) {

    console.error(
      'Admin draft error:',
      error
    );

    return res.status(500).json({
      error:
        'حدث خطأ أثناء حفظ المسودة.'
    });
  }
}
