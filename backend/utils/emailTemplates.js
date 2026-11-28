/**
 * Sage X3 Desk — Enterprise Email Templates
 * Pixel-perfect branded HTML emails matching Sage X3 Desk's web design system:
 * Dark obsidian header (#090D16 / #0F172A), Electric Lime accent (#C6F36B),
 * clean typography, structured metadata cards, and security callouts.
 */

// ─── Base Layout Shell ───────────────────────────────────────────────────────
export function renderEmailShell({
  previewText = 'Sage X3 Desk Notification',
  headerBadge = 'WORKSPACE NOTIFICATION',
  headerBadgeColor = '#C6F36B',
  title = 'Sage X3 Desk',
  subtitle = 'Centralized Sage X3 Team Operations & Ticketing Platform',
  contentHtml = '',
  clientUrl = 'https://sage-x3-desk.vercel.app',
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Arial, Helvetica, sans-serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#334155;">
  <!-- Hidden preview text for email client inboxes -->
  <div style="display:none;font-size:1px;color:#0b0f19;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${previewText}
  </div>

  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#0b0f19;padding:32px 12px;">
    <tr>
      <td align="center">
        <!-- Main Email Container -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.35);">
          
          <!-- Top Electric Lime Accent Line -->
          <tr>
            <td style="height:4px;background-color:#C6F36B;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Header Section -->
          <tr>
            <td style="background-color:#090d16;padding:28px 32px;border-bottom:1px solid #1e293b;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <!-- Brand Logo Block -->
                  <td align="left" style="vertical-align:middle;">
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td style="background-color:#171717;border:1px solid #262626;color:#C6F36B;font-weight:900;font-size:16px;width:38px;height:38px;text-align:center;border-radius:10px;vertical-align:middle;font-family:'JetBrains Mono',Consolas,monospace;">
                          X3
                        </td>
                        <td style="padding-left:14px;vertical-align:middle;">
                          <div style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-0.2px;line-height:1.2;">
                            Sage X3 Desk
                          </div>
                          <div style="color:#94a3b8;font-size:11px;font-weight:500;letter-spacing:0.3px;margin-top:2px;">
                            ${subtitle}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Header Badge -->
                  ${
                    headerBadge
                      ? `
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;padding:4px 10px;background-color:rgba(198,243,107,0.1);border:1px solid rgba(198,243,107,0.25);color:${headerBadgeColor};font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;border-radius:6px;font-family:'JetBrains Mono',Consolas,monospace;">
                      ${headerBadge}
                    </span>
                  </td>`
                      : ''
                  }
                </tr>
              </table>
            </td>
          </tr>

          <!-- Content Body -->
          <tr>
            <td style="padding:36px 36px 28px;background-color:#ffffff;font-size:14px;line-height:1.6;color:#334155;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer Section -->
          <tr>
            <td style="background-color:#f8fafc;padding:24px 36px;border-top:1px solid #e2e8f0;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" style="color:#64748b;font-size:12px;line-height:1.5;">
                    <div style="font-weight:600;color:#0f172a;">Sage X3 Desk Enterprise Platform</div>
                    <div style="margin-top:2px;">This is an automated operational notification. Please do not reply directly to this email.</div>
                  </td>
                </tr>
                <tr>
                  <td style="padding-top:16px;">
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="left" style="color:#94a3b8;font-size:11px;">
                          &copy; 2026 Sage X3 Desk. All rights reserved.
                        </td>
                        <td align="right" style="font-size:11px;">
                          <a href="${clientUrl}" style="color:#0f172a;text-decoration:none;font-weight:600;">Open Workspace &rarr;</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── 1. Verify Email / Registration OTP ──────────────────────────────────────
export function getVerifyEmailTemplate({ fullName, code, expiresInMinutes = 15, clientUrl }) {
  const contentHtml = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">
      Verify Your Email Address
    </h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">
      Hi <strong style="color:#0f172a;">${fullName || 'Team Member'}</strong>, welcome to Sage X3 Desk!
    </p>
    <p style="margin:0 0 24px;color:#334155;font-size:14px;line-height:1.6;">
      Your developer account has been registered. Please enter the 4-digit verification code below in your browser to activate your account and gain access to your team workspace.
    </p>

    <!-- OTP Display Box (UI Matching Dark Tile with Electric Lime Code) -->
    <div style="margin:28px 0;text-align:center;">
      <div style="display:inline-block;background-color:#090d16;border:1px solid #1e293b;border-radius:12px;padding:20px 36px;box-shadow:0 8px 16px rgba(0,0,0,0.15);">
        <div style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;font-family:'JetBrains Mono',Consolas,monospace;">
          Verification Code
        </div>
        <div style="color:#C6F36B;font-size:36px;font-weight:800;letter-spacing:14px;font-family:'JetBrains Mono',Consolas,monospace;padding-left:14px;">
          ${code}
        </div>
      </div>
      <div style="margin-top:10px;color:#64748b;font-size:12px;">
        Expires in <strong>${expiresInMinutes} minutes</strong>
      </div>
    </div>

    <!-- Security Note -->
    <div style="background-color:#f8fafc;border-left:3px solid #0f172a;border-radius:0 8px 8px 0;padding:12px 16px;margin:24px 0 8px;font-size:12px;color:#475569;line-height:1.5;">
      <strong>Security Notice:</strong> If you did not create an account on Sage X3 Desk, please disregard this email. No account will be activated without this verification code.
    </div>
  `;

  return renderEmailShell({
    previewText: `Your Sage X3 Desk verification code is ${code}`,
    headerBadge: 'VERIFY EMAIL',
    headerBadgeColor: '#C6F36B',
    title: 'Verify Your Sage X3 Desk Account',
    contentHtml,
    clientUrl,
  });
}

// ─── 2. Account Activated / Welcome to Workspace ─────────────────────────────
export function getWelcomeActivatedTemplate({ fullName, employeeId, email, designation, clientUrl }) {
  const contentHtml = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">
      Welcome to Sage X3 Desk!
    </h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">
      Hi <strong style="color:#0f172a;">${fullName}</strong>, your account is now fully verified and activated.
    </p>

    <!-- Account Details Card -->
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin:20px 0 24px;">
      <div style="font-size:12px;font-weight:700;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">
        Account Information
      </div>
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size:13px;">
        <tr>
          <td style="color:#64748b;width:120px;font-weight:500;">Employee ID:</td>
          <td style="color:#0f172a;font-weight:600;font-family:'JetBrains Mono',Consolas,monospace;">${employeeId || 'EMP-101'}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-weight:500;">Work Email:</td>
          <td style="color:#0f172a;font-weight:600;">${email}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-weight:500;">Designation:</td>
          <td style="color:#0f172a;font-weight:600;">${designation || 'Sage X3 Developer'}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-weight:500;">Status:</td>
          <td style="color:#16a34a;font-weight:700;">Active &bull; Verified</td>
        </tr>
      </table>
    </div>

    <!-- CTA Button -->
    <div style="text-align:center;margin:28px 0 20px;">
      <a href="${clientUrl}" style="display:inline-block;background-color:#090d16;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:-0.1px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
        Open Sage X3 Desk Workspace &rarr;
      </a>
    </div>

    <p style="margin:20px 0 0;color:#64748b;font-size:13px;line-height:1.5;">
      You can now log in, review assigned tickets, submit code deliverables, and collaborate with your team leads.
    </p>
  `;

  return renderEmailShell({
    previewText: `Welcome to Sage X3 Desk, ${fullName}! Your account is active.`,
    headerBadge: 'ACCOUNT ACTIVATED',
    headerBadgeColor: '#C6F36B',
    title: 'Account Activated — Sage X3 Desk',
    contentHtml,
    clientUrl,
  });
}

// ─── 3. Login Detected / Security Alert ──────────────────────────────────────
export function getLoginAlertTemplate({
  fullName,
  email,
  timestamp,
  ipAddress = '127.0.0.1',
  userAgent = 'Desktop Browser',
  resetPasswordUrl,
  clientUrl,
}) {
  const contentHtml = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">
      New Sign-In Detected
    </h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">
      Hi <strong style="color:#0f172a;">${fullName}</strong>, your Sage X3 Desk account (<span style="color:#0f172a;">${email}</span>) was just accessed.
    </p>

    <!-- Sign-in Details Table -->
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:18px 20px;margin:20px 0;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:12px;font-family:'JetBrains Mono',Consolas,monospace;">
        Authentication Details
      </div>
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="5" style="font-size:13px;">
        <tr>
          <td style="color:#64748b;width:110px;font-weight:500;">Time:</td>
          <td style="color:#0f172a;font-weight:600;">${timestamp}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-weight:500;">IP Address:</td>
          <td style="color:#0f172a;font-weight:600;font-family:'JetBrains Mono',Consolas,monospace;">${ipAddress}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-weight:500;">Client / Device:</td>
          <td style="color:#0f172a;font-weight:600;word-break:break-all;">${userAgent}</td>
        </tr>
        <tr>
          <td style="color:#64748b;font-weight:500;">Result:</td>
          <td style="color:#16a34a;font-weight:700;">Authorized Session Created</td>
        </tr>
      </table>
    </div>

    <!-- Security Warning & Action -->
    <div style="background-color:#fff1f2;border:1px solid #ffe4e6;border-left:4px solid #e11d48;border-radius:0 8px 8px 0;padding:16px 18px;margin:24px 0;">
      <div style="font-size:13px;font-weight:700;color:#9f1239;margin-bottom:4px;">
        Don't recognize this activity?
      </div>
      <div style="font-size:12px;color:#be123c;line-height:1.5;">
        If you did not sign in recently, someone else may have obtained your password. Please reset your password immediately to protect your workspace.
      </div>
      <div style="margin-top:12px;">
        <a href="${resetPasswordUrl || `${clientUrl}/reset-password`}" style="display:inline-block;background-color:#e11d48;color:#ffffff;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;">
          Secure My Account &rarr;
        </a>
      </div>
    </div>
  `;

  return renderEmailShell({
    previewText: `New sign-in detected on your Sage X3 Desk account from ${ipAddress}`,
    headerBadge: 'SECURITY ALERT',
    headerBadgeColor: '#f43f5e',
    title: 'Security Alert: New Sign-In to Sage X3 Desk',
    contentHtml,
    clientUrl,
  });
}

// ─── 4. Reset Password (with Ignore if not requested) ────────────────────────
export function getPasswordResetTemplate({ fullName, resetUrl, code, expiresInMinutes = 60, clientUrl }) {
  const contentHtml = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">
      Reset Your Password
    </h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">
      Hi <strong style="color:#0f172a;">${fullName}</strong>,
    </p>
    <p style="margin:0 0 24px;color:#334155;font-size:14px;line-height:1.6;">
      We received a request to reset your Sage X3 Desk account password. You can set a new password by clicking the button below and entering your 4-digit verification code.
    </p>

    <!-- Reset Password CTA Button -->
    <div style="text-align:center;margin:28px 0 20px;">
      <a href="${resetUrl}" style="display:inline-block;background-color:#090d16;color:#ffffff;text-decoration:none;padding:14px 34px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:-0.1px;box-shadow:0 4px 14px rgba(0,0,0,0.2);">
        Reset My Password &rarr;
      </a>
    </div>

    <!-- 4-Digit Verification Code Tile -->
    <div style="margin:24px 0;text-align:center;">
      <div style="display:inline-block;background-color:#090d16;border:1px solid #1e293b;border-radius:12px;padding:16px 32px;box-shadow:0 6px 14px rgba(0,0,0,0.12);">
        <div style="color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;font-family:'JetBrains Mono',Consolas,monospace;">
          Verification Code
        </div>
        <div style="color:#C6F36B;font-size:32px;font-weight:800;letter-spacing:12px;font-family:'JetBrains Mono',Consolas,monospace;padding-left:12px;">
          ${code}
        </div>
      </div>
      <div style="margin-top:8px;color:#64748b;font-size:12px;">
        This link and code expire in <strong>${expiresInMinutes} minutes</strong>
      </div>
    </div>

    <!-- User-Requested Notice: "Ignore if not sent" -->
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #64748b;border-radius:0 8px 8px 0;padding:14px 18px;margin:28px 0 8px;">
      <div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:3px;">
        Did not request this reset?
      </div>
      <div style="font-size:12px;color:#64748b;line-height:1.5;">
        If you didn't request a password reset, <strong>please ignore this email</strong>. Your password will remain unchanged and your account remains completely secure.
      </div>
    </div>
  `;

  return renderEmailShell({
    previewText: `Reset your Sage X3 Desk password. Verification code: ${code}`,
    headerBadge: 'PASSWORD RESET',
    headerBadgeColor: '#C6F36B',
    title: 'Reset Your Sage X3 Desk Password',
    contentHtml,
    clientUrl,
  });
}

// ─── 5. Ticket / Work Assigned to You ────────────────────────────────────────
export function getTicketAssignedTemplate({
  recipientName,
  ticketId,
  ticketTitle,
  priority = 'Medium',
  clientName,
  projectName,
  assignedByName,
  ticketUrl,
  description = '',
  clientUrl,
}) {
  const priorityColors = {
    Critical: { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
    High: { bg: '#fff7ed', text: '#c2410c', border: '#fed7aa' },
    Medium: { bg: '#eff6ff', text: '#1d4ed8', border: '#bfdbfe' },
    Low: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  };
  const pStyle = priorityColors[priority] || priorityColors.Medium;

  const contentHtml = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">
      New Work Assigned to You
    </h2>
    <p style="margin:0 0 20px;color:#64748b;font-size:14px;">
      Hi <strong style="color:#0f172a;">${recipientName}</strong>, you have been assigned to a ticket by <strong style="color:#0f172a;">${assignedByName}</strong>.
    </p>

    <!-- Ticket Card -->
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px 22px;margin:20px 0;">
      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom:12px;">
        <tr>
          <td align="left">
            <span style="display:inline-block;padding:4px 8px;background-color:#090d16;color:#C6F36B;font-size:12px;font-weight:800;border-radius:6px;font-family:'JetBrains Mono',Consolas,monospace;">
              ${ticketId}
            </span>
          </td>
          <td align="right">
            <span style="display:inline-block;padding:3px 10px;background-color:${pStyle.bg};color:${pStyle.text};border:1px solid ${pStyle.border};font-size:11px;font-weight:700;border-radius:999px;text-transform:uppercase;">
              ${priority} Priority
            </span>
          </td>
        </tr>
      </table>

      <h3 style="margin:0 0 14px;font-size:16px;font-weight:700;color:#0f172a;line-height:1.4;">
        ${ticketTitle}
      </h3>

      <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="4" style="font-size:13px;border-top:1px solid #e2e8f0;padding-top:10px;">
        ${
          clientName
            ? `
        <tr>
          <td style="color:#64748b;width:90px;font-weight:500;">Client:</td>
          <td style="color:#0f172a;font-weight:600;">${clientName}</td>
        </tr>`
            : ''
        }
        ${
          projectName
            ? `
        <tr>
          <td style="color:#64748b;font-weight:500;">Project:</td>
          <td style="color:#0f172a;font-weight:600;">${projectName}</td>
        </tr>`
            : ''
        }
        <tr>
          <td style="color:#64748b;font-weight:500;">Assigned By:</td>
          <td style="color:#0f172a;font-weight:600;">${assignedByName}</td>
        </tr>
      </table>

      ${
        description
          ? `
      <div style="margin-top:14px;padding-top:12px;border-top:1px dashed #cbd5e1;color:#475569;font-size:13px;line-height:1.5;">
        ${description.slice(0, 180)}${description.length > 180 ? '...' : ''}
      </div>`
          : ''
      }
    </div>

    <!-- CTA Button -->
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="${ticketUrl}" style="display:inline-block;background-color:#090d16;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:-0.1px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
        Open Ticket in Workspace &rarr;
      </a>
    </div>
  `;

  return renderEmailShell({
    previewText: `Assigned to ${ticketId}: ${ticketTitle} by ${assignedByName}`,
    headerBadge: 'TICKET ASSIGNED',
    headerBadgeColor: '#C6F36B',
    title: `Assigned: ${ticketId} — ${ticketTitle}`,
    contentHtml,
    clientUrl,
  });
}

// ─── 6. Ticket Updated with Comment ──────────────────────────────────────────
export function getTicketCommentTemplate({
  recipientName,
  commenterName,
  ticketId,
  ticketTitle,
  commentBody,
  ticketUrl,
  isInternal = false,
  timestamp,
  clientUrl,
}) {
  const contentHtml = `
    <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#0f172a;letter-spacing:-0.3px;">
      New Comment on ${ticketId}
    </h2>
    <p style="margin:0 0 18px;color:#64748b;font-size:14px;">
      Hi <strong style="color:#0f172a;">${recipientName}</strong>,
      <strong style="color:#0f172a;">${commenterName}</strong> left a new ${
    isInternal ? '<span style="color:#b45309;font-weight:600;">internal note</span>' : 'comment'
  } on <strong style="color:#0f172a;">${ticketTitle}</strong>:
    </p>

    <!-- Comment Blockquote Card -->
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-left:4px solid #090d16;border-radius:0 10px 10px 0;padding:18px 22px;margin:20px 0;">
      <div style="font-size:12px;font-weight:700;color:#0f172a;margin-bottom:8px;">
        ${commenterName}
        <span style="font-weight:400;color:#94a3b8;margin-left:8px;font-size:11px;">${timestamp || 'Just now'}</span>
      </div>
      <div style="color:#334155;font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word;">${commentBody}</div>
    </div>

    <!-- CTA Button -->
    <div style="text-align:center;margin:28px 0 16px;">
      <a href="${ticketUrl}" style="display:inline-block;background-color:#090d16;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:14px;font-weight:700;letter-spacing:-0.1px;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
        Reply in Sage X3 Desk &rarr;
      </a>
    </div>
  `;

  return renderEmailShell({
    previewText: `${commenterName} commented on ${ticketId}: "${commentBody.slice(0, 80)}"`,
    headerBadge: isInternal ? 'INTERNAL NOTE' : 'COMMENT ADDED',
    headerBadgeColor: '#C6F36B',
    title: `Comment on ${ticketId}: ${ticketTitle}`,
    contentHtml,
    clientUrl,
  });
}
