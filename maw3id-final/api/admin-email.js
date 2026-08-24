export default async function handler(req, res) {
  // Allow POST only
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
        error: 'غير مصرح لك بإرسال البريد.'
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

    // Basic email validation
    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(to)) {
      return res.status(400).json({
        error: 'البريد الإلكتروني غير صحيح.'
      });
    }

    // =========================
    // Resend
    // =========================

    const resendApiKey =
      process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      console.error(
        'RESEND_API_KEY is missing'
      );

      return res.status(500).json({
        error: 'إعدادات البريد غير مكتملة.'
      });
    }

    // =========================
    // Sender
    // =========================
    //
    // IMPORTANT:
    // Change this to the email address
    // you verified inside Resend.
    //
    // Example:
    // "مَوعد <no-reply@yourdomain.com>"
    //

    const from =
      process.env.ADMIN_EMAIL;

    if (!from) {
      console.error(
        'ADMIN_EMAIL is missing'
      );

      return res.status(500).json({
        error: 'بريد المرسل غير مضبوط.'
      });
    }

    // =========================
    // Send email
    // =========================

    const response =
      await fetch(
        'https://api.resend.com/emails',
        {
          method: 'POST',

          headers: {
            'Authorization':
              `Bearer ${resendApiKey}`,

            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            from: from,
            to: [to],
            subject: subject,

            // Plain text
            text: message,

            // Simple HTML version
            html: `
              <div
                dir="rtl"
                style="
                  font-family: Arial, sans-serif;
                  line-height: 1.8;
                  color: #172033;
                  white-space: pre-line;
                "
              >
                ${escapeHTML(message)}
              </div>
            `
          })
        }
      );

    const data =
      await response.json();

    // =========================
    // Resend error
    // =========================

    if (!response.ok) {
      console.error(
        'Resend error:',
        data
      );

      return res.status(
        response.status
      ).json({
        error:
          data?.message ||
          data?.error ||
          'تعذر إرسال البريد.'
      });
    }

    // =========================
    // Success
    // =========================

    return res.status(200).json({
      success: true,
      message: 'تم إرسال البريد بنجاح.',
      id: data.id || null
    });

  } catch (error) {

    console.error(
      'Admin email error:',
      error
    );

    return res.status(500).json({
      error:
        'حدث خطأ أثناء إرسال البريد.'
    });
  }
}


// =========================
// Escape HTML
// =========================

function escapeHTML(value) {
  return String(value)

    .replace(
      /&/g,
      '&amp;'
    )

    .replace(
      /</g,
      '&lt;'
    )

    .replace(
      />/g,
      '&gt;'
    )

    .replace(
      /"/g,
      '&quot;'
    )

    .replace(
      /'/g,
      '&#039;'
    );
}
