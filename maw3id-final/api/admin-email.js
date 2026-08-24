```javascript
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

    // =========================
    // Basic email validation
    // =========================

    const emailRegex =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(to)) {
      return res.status(400).json({
        error: 'البريد الإلكتروني غير صحيح.'
      });
    }

    // =========================
    // Environment variables
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
    // Save initial email record
    // =========================

    const createRecordResponse =
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
            status: 'failed'
          })
        }
      );

    const createdRecords =
      await createRecordResponse.json();

    if (!createRecordResponse.ok) {
      console.error(
        'Failed to create email record:',
        createdRecords
      );

      return res.status(500).json({
        error: 'تعذر حفظ سجل البريد.'
      });
    }

    const emailRecord =
      Array.isArray(createdRecords)
        ? createdRecords[0]
        : createdRecords;

    const emailRecordId =
      emailRecord?.id;

    // =========================
    // Send through Resend
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
            from:
              'Maw3id <noreply@maw3id.online>',

            to: [to],

            subject: subject,

            text: message,

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
    // Resend failed
    // =========================

    if (!response.ok) {
      console.error(
        'Resend error:',
        data
      );

      const errorMessage =
        data?.message ||
        data?.error ||
        'تعذر إرسال البريد.';

      // Update record as failed
      if (emailRecordId) {

        await fetch(
          `${supabaseUrl}/rest/v1/admin_emails?id=eq.${encodeURIComponent(emailRecordId)}`,
          {
            method: 'PATCH',

            headers: {
              'apikey':
                supabaseServiceRoleKey,

              'Authorization':
                `Bearer ${supabaseServiceRoleKey}`,

              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({
              status: 'failed',
              error_message: errorMessage,
              updated_at:
                new Date().toISOString()
            })
          }
        );

      }

      return res.status(
        response.status
      ).json({
        success: false,
        failed: true,
        saved: true,
        email_id:
          emailRecordId || null,
        error:
          errorMessage
      });
    }

    // =========================
    // Sending succeeded
    // =========================

    if (emailRecordId) {

      const updateResponse =
        await fetch(
          `${supabaseUrl}/rest/v1/admin_emails?id=eq.${encodeURIComponent(emailRecordId)}`,
          {
            method: 'PATCH',

            headers: {
              'apikey':
                supabaseServiceRoleKey,

              'Authorization':
                `Bearer ${supabaseServiceRoleKey}`,

              'Content-Type':
                'application/json'
            },

            body: JSON.stringify({
              status: 'sent',
              resend_id:
                data.id || null,
              sent_at:
                new Date().toISOString(),
              error_message: null,
              updated_at:
                new Date().toISOString()
            })
          }
        );

      if (!updateResponse.ok) {

        console.error(
          'Email sent but record update failed.'
        );

      }

    }

    // =========================
    // Success
    // =========================

    return res.status(200).json({
      success: true,
      message: 'تم إرسال البريد بنجاح.',
      id:
        data.id || null,
      email_id:
        emailRecordId || null
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
```
