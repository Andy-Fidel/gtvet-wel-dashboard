import nodemailer from 'nodemailer';

// Configure standard generic SMTP. Normally these would be in .env
// We'll use Ethereal for testing, but provide fallbacks
const config = {
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: process.env.SMTP_PORT || 587,
  auth: {
    user: process.env.SMTP_USER || 'delbert.davis50@ethereal.email', // Replace with real Ethereal
    pass: process.env.SMTP_PASS || '3y6V6kQwB1uPZbY6fP', // Replace with real Ethereal
  }
};

const transporter = nodemailer.createTransport(config);

export const sendPlacementApprovalEmail = async (institutionEmail, learnerName, companyName, trackingId) => {
    try {
        const info = await transporter.sendMail({
            from: '"GTVET Admin" <no-reply@gtvet.gov.gh>',
            to: institutionEmail,
            subject: `Placement Approved: ${learnerName}`,
            html: `
                <div style="font-family: sans-serif; color: #333;">
                    <h2>Placement Approved</h2>
                    <p>Good news! The placement request for <strong>${learnerName}</strong> (Tracking ID: ${trackingId}) has been fully approved by HQ.</p>
                    <p>They have been officially placed at <strong>${companyName}</strong>.</p>
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
        const isApproved = status === 'HQ_Approved';
        const color = isApproved ? 'green' : (status === 'Rejected' ? 'red' : 'orange');
        
        const info = await transporter.sendMail({
            from: '"GTVET Admin" <no-reply@gtvet.gov.gh>',
            to: institutionEmail,
            subject: `Semester Report Update: ${status.replace('_', ' ')}`,
            html: `
                <div style="font-family: sans-serif; color: #333;">
                    <h2>Semester Report Status Update</h2>
                    <p>The status of your Semester Report for <strong>${semester} (${academicYear})</strong> has been updated.</p>
                    <p>Current Status: <strong style="color: ${color};">${status.replace('_', ' ')}</strong></p>
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
        const info = await transporter.sendMail({
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
