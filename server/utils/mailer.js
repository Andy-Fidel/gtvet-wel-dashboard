import nodemailer from 'nodemailer';

const smtpConfigured = Boolean(
  process.env.SMTP_HOST
  && process.env.SMTP_PORT
  && process.env.SMTP_USER
  && process.env.SMTP_PASS
);

const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

export const isMailerConfigured = () => smtpConfigured;

const assertMailerConfigured = () => {
  if (!transporter) {
    const error = new Error('Email delivery is not configured on this server');
    error.code = 'MAILER_NOT_CONFIGURED';
    throw error;
  }
  return transporter;
};

// Prevent HTML/XSS injection in email templates
const escapeHtml = (value) => {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

export const sendPlacementApprovalEmail = async (institutionEmail, learnerName, companyName, trackingId) => {
    try {
        const safeLearnerName = escapeHtml(learnerName);
        const safeCompanyName = escapeHtml(companyName);
        const safeTrackingId = escapeHtml(trackingId);
        const info = await assertMailerConfigured().sendMail({
            from: '"GTVET Admin" <no-reply@gtvet.gov.gh>',
            to: institutionEmail,
            subject: `Placement Approved: ${safeLearnerName}`,
            html: `
                <div style="font-family: sans-serif; color: #333;">
                    <h2>Placement Approved</h2>
                    <p>Good news! The placement request for <strong>${safeLearnerName}</strong> (Tracking ID: ${safeTrackingId}) has been fully approved by HQ.</p>
                    <p>They have been officially placed at <strong>${safeCompanyName}</strong>.</p>
                    <br/>
                    <p>Please log in to the Dashboard to review the details and initiate the required Monitoring Visits.</p>
                    <p>Best regards,<br/>The GTVET Team</p>
                </div>
            `
        });
        console.log("Message sent: %s", info.messageId);
        // If using ethereal email, you can get a preview URL
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        return info;
    } catch (error) {
        console.error("Error sending email:", error);
    }
};

export const sendReportStatusEmail = async (institutionEmail, semester, academicYear, status) => {
    try {
        const safeSemester = escapeHtml(semester);
        const safeAcademicYear = escapeHtml(academicYear);
        const safeStatus = escapeHtml(status?.replace('_', ' '));
        const isApproved = status === 'HQ_Approved';
        const color = isApproved ? 'green' : (status === 'Rejected' ? 'red' : 'orange');
        
        const info = await assertMailerConfigured().sendMail({
            from: '"GTVET Admin" <no-reply@gtvet.gov.gh>',
            to: institutionEmail,
            subject: `Semester Report Update: ${safeStatus}`,
            html: `
                <div style="font-family: sans-serif; color: #333;">
                    <h2>Semester Report Status Update</h2>
                    <p>The status of your Semester Report for <strong>${safeSemester} (${safeAcademicYear})</strong> has been updated.</p>
                    <p>Current Status: <strong style="color: ${color};">${safeStatus}</strong></p>
                    <br/>
                    <p>Please log in to the Dashboard to review any feedback or required changes.</p>
                    <p>Best regards,<br/>The GTVET Team</p>
                </div>
            `
        });
        console.log("Message sent: %s", info.messageId);
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        return info;
    } catch (error) {
        console.error("Error sending email:", error);
    }
};

export const sendPasswordResetEmail = async (email, resetUrl) => {
    try {
        const info = await assertMailerConfigured().sendMail({
            from: '"GTVET Security" <security@gtvet.gov.gh>',
            to: email,
            subject: 'Password Reset Request',
            html: `
                <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; padding: 20px; border-radius: 8px;">
                    <h2 style="color: #111;">Password Reset</h2>
                    <p>We received a request to reset the password for your GTVET account.</p>
                    <p>Please click the button below to choose a new password. This link will expire in 1 hour.</p>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
                    </div>
                    <p style="font-size: 14px; color: #666;">If you did not request a password reset, you can safely ignore this email.</p>
                    <hr style="border: none; border-top: 1px solid #eaeaea; margin: 20px 0;" />
                    <p style="font-size: 12px; color: #999; text-align: center;">This is an automated message from the GTVET system.</p>
                </div>
            `
        });
        console.log("Password Reset Email Sent: %s", info.messageId);
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        return info;
    } catch (error) {
        console.error("Error sending password reset email:", error);
    }
};

export const sendHQIndustryPartnerSubmissionEmail = async (emails, partner, submittedBy) => {
    try {
        const frontendBase = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
        const registryUrl = `${frontendBase}/hq-industry-partners`;
        const safeName = escapeHtml(partner.name);
        const safeSector = escapeHtml(partner.sector);
        const safeRegion = escapeHtml(partner.region);
        const safeContact = escapeHtml(partner.contactPerson || 'N/A');
        const safeContactEmail = escapeHtml(partner.contactEmail);
        const safeSubmitter = escapeHtml(submittedBy?.name || 'Unknown');
        const safeSubmitterRole = escapeHtml(submittedBy?.role);
        const info = await assertMailerConfigured().sendMail({
            from: '"GTVET HQ" <no-reply@gtvet.gov.gh>',
            to: emails,
            subject: `HQ Approval Needed: ${safeName}`,
            html: `
                <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eaeaea; padding: 20px; border-radius: 8px;">
                    <h2 style="color: #111;">Industry Partner Approval Required</h2>
                    <p>A new industry partner has been submitted and is awaiting HQ approval.</p>
                    <div style="background: #fafafa; border: 1px solid #eaeaea; border-radius: 8px; padding: 16px; margin: 20px 0;">
                        <p><strong>Company:</strong> ${safeName}</p>
                        <p><strong>Sector:</strong> ${safeSector}</p>
                        <p><strong>Region:</strong> ${safeRegion}</p>
                        <p><strong>Capacity:</strong> ${partner.totalSlots || 0} slots</p>
                        <p><strong>Contact:</strong> ${safeContact}${safeContactEmail ? ` (${safeContactEmail})` : ''}</p>
                        <p><strong>Submitted by:</strong> ${safeSubmitter}${safeSubmitterRole ? ` (${safeSubmitterRole})` : ''}</p>
                    </div>
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${registryUrl}" style="background-color: #111; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Open HQ Partner Registry</a>
                    </div>
                    <p style="font-size: 14px; color: #666;">Review and approve or reject the submission from the HQ Industry Partner Registry.</p>
                </div>
            `
        });
        console.log("HQ Partner Approval Email Sent: %s", info.messageId);
        console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        return info;
    } catch (error) {
        console.error("Error sending HQ industry partner submission email:", error);
    }
};
