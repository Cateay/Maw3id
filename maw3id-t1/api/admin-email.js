function getSupabaseConfig() {
  return {
    url: process.env.SUPABASE_URL,
    key:
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = getSupabaseConfig();

  if (!url || !key) {
    throw new Error('Supabase environment variables are missing');
  }

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      data?.message ||
      data?.hint ||
      data?.details ||
      'تعذر تحديث سجل البريد.'
    );
  }

  return data;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    String(email || '').trim()
  );
}

function clean(value) {
  return String(value ?? '').trim();
}

async function createSentHistory({
  draftId,
  recipient,
  subject,
  message,
  resendId,
  sentAt
}) {
  const record = {
    recipient,
    subject,
    message,
    status: 'sent',
    resend_id: resendId || null,
    sent_at: sentAt,
    updated_at: sentAt
  };

  // When an existing draft was sent, convert that exact row to "sent"
  // instead of deleting it and creating a duplicate history row.
  if (draftId) {
    const updated = await supabaseRequest(
      `admin_emails?id=eq.${encodeURIComponent(draftId)}&status=eq.draft`,
      {
        method: 'PATCH',
        headers: {
          Prefer: 'return=representation'
        },
        body: JSON.stringify(record)
      }
    );

    if (updated?.length) {
      return updated[0];
    }
  }

  const inserted = await supabaseRequest('admin_emails', {
    method: 'POST',
    headers: {
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      ...record,
      created_at: sentAt
    })
  });

  return inserted?.[0] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

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

  const {
    to,
    subject,
    message,
    draft_id
  } = req.body || {};

  const recipient = clean(to);
  const cleanSubject = clean(subject);
  const cleanMessage = clean(message);
  const draftId = clean(draft_id) || null;

  if (!recipient || !validateEmail(recipient)) {
    return res.status(400).json({
      error: 'البريد الإلكتروني للمستلم غير صحيح.'
    });
  }

  if (!cleanSubject) {
    return res.status(400).json({
      error: 'عنوان الرسالة مطلوب.'
    });
  }

  if (!cleanMessage) {
    return res.status(400).json({
      error: 'نص الرسالة مطلوب.'
    });
  }

  const resendApiKey =
    process.env.RESEND_API_KEY;

  if (!resendApiKey) {
    console.error('RESEND_API_KEY is missing');

    return res.status(500).json({
      error: 'إعدادات البريد غير مكتملة.'
    });
  }

  const from =
    'Maw3id <noreply@maw3id.online>';

  try {
    const response =
      await fetch(
        'https://api.resend.com/emails',
        {
          method: 'POST',
          headers: {
            Authorization:
              `Bearer ${resendApiKey}`,
            'Content-Type':
              'application/json'
          },
          body: JSON.stringify({
            from,
            to: [recipient],
            subject: cleanSubject,
            text: cleanMessage,
            html: `
              <div
                dir="rtl"
                style="
                  font-family:Arial,sans-serif;
                  line-height:1.8;
                  color:#172033;
                  white-space:pre-line;
                "
              >
                ${escapeHTML(cleanMessage)}
              </div>
            `
          })
        }
      );

    const data =
      await response.json().catch(
        () => ({})
      );

    if (!response.ok) {
      const reason =
        data?.message ||
        data?.error ||
        `Resend HTTP ${response.status}`;

      console.error(
        'Resend error:',
        data
      );

      // The database now stores only drafts and successfully sent
      // emails, so a failed attempt is intentionally not added to history.
      return res.status(
        response.status >= 400 &&
        response.status < 600
          ? response.status
          : 500
      ).json({
        error: reason
      });
    }

    const sentAt =
      new Date().toISOString();

    try {
      await createSentHistory({
        draftId,
        recipient,
        subject: cleanSubject,
        message: cleanMessage,
        resendId: data.id || null,
        sentAt
      });
    } catch (logError) {
      // Resend already accepted the email. Do not tell the admin
      // that sending failed just because history logging failed.
      console.error(
        'Email sent but could not be saved to history:',
        logError
      );
    }

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

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
