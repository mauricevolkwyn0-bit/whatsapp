// lib/email/mailgun.ts
import formData from 'form-data'
import Mailgun from 'mailgun.js'

const mailgun = new Mailgun(formData)

const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY || '',
  url: 'https://api.mailgun.net' // Use EU endpoint if needed: https://api.eu.mailgun.net
})

// ═══════════════════════════════════════════════════════════════
// SEND ID VERIFICATION EMAIL (No code needed for mining)
// ═══════════════════════════════════════════════════════════════
export async function sendIDVerificationEmail(
  to: string,
  firstName: string,
  lastName: string,
  idNumber: string
) {
  try {
    console.log('📧 Sending ID verification confirmation to:', to)

    const messageData = {
      from: `JustWork Mining <${process.env.MAILGUN_FROM_EMAIL || 'noreply@justwork.co.za'}>`,
      to: [to],
      subject: 'ID Verification Successful - JustWork Mining',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                margin: 0;
                padding: 0;
                background-color: #f4f4f4;
              }
              .email-container {
                max-width: 600px;
                margin: 20px auto;
                background: #ffffff;
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              .header {
                background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
                color: white;
                padding: 30px;
                text-align: center;
              }
              .header h1 {
                margin: 0;
                font-size: 28px;
                font-weight: 600;
              }
              .content {
                padding: 40px 30px;
              }
              .info-box {
                background: #f9f9f9;
                border-left: 4px solid #d97706;
                padding: 15px;
                margin: 20px 0;
              }
              .footer {
                background: #f9f9f9;
                padding: 20px 30px;
                text-align: center;
                color: #666;
                font-size: 12px;
                border-top: 1px solid #e0e0e0;
              }
              .footer a {
                color: #d97706;
                text-decoration: none;
              }
            </style>
          </head>
          <body>
            <div class="email-container">
              <div class="header">
                <h1>✅ ID Verified Successfully</h1>
              </div>
              
              <div class="content">
                <p style="font-size: 16px; margin-bottom: 10px;">Hi <strong>${firstName} ${lastName}</strong>,</p>
                
                <p>Welcome to <strong>JustWork Mining</strong>! 🇿🇦⛏️</p>
                
                <p>Your South African ID has been successfully verified through Home Affairs.</p>
                
                <div class="info-box">
                  <strong>Verified Details:</strong><br>
                  Name: ${firstName} ${lastName}<br>
                  ID Number: ${idNumber.substring(0, 6)}******
                </div>
                
                <p><strong>Next Steps:</strong></p>
                <ol>
                  <li>Complete your registration on WhatsApp</li>
                  <li>Upload required documents</li>
                  <li>Start receiving job notifications</li>
                </ol>
                
                <p>Continue your registration on WhatsApp to complete your profile.</p>
              </div>
              
              <div class="footer">
                <p>
                  <strong>Need help?</strong><br>
                  WhatsApp: <a href="https://wa.me/27730899949">+27 73 089 9949</a><br>
                  Email: <a href="mailto:support@justwork.co.za">support@justwork.co.za</a>
                </p>
                <p style="margin-top: 15px; color: #999;">
                  © ${new Date().getFullYear()} JustWork Mining. All rights reserved.
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
Hi ${firstName} ${lastName},

Welcome to JustWork Mining!

Your South African ID has been successfully verified through Home Affairs.

Verified Details:
Name: ${firstName} ${lastName}
ID Number: ${idNumber.substring(0, 6)}******

Next Steps:
1. Complete your registration on WhatsApp
2. Upload required documents
3. Start receiving job notifications

Continue your registration on WhatsApp to complete your profile.

Need help?
WhatsApp: +27 73 089 9949
Email: support@justwork.co.za

© ${new Date().getFullYear()} JustWork Mining
      `.trim()
    }

    const result = await mg.messages.create(
      process.env.MAILGUN_DOMAIN || '', 
      messageData
    )

    console.log('✅ ID verification email sent:', result)
    return result
  } catch (error) {
    console.error('❌ Mailgun error:', error)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════
// SEND REGISTRATION COMPLETE EMAIL
// ═══════════════════════════════════════════════════════════════
export async function sendWelcomeEmail(
  to: string,
  firstName: string,
  experienceLevel: 'general_worker' | 'semi_skilled' | 'skilled_worker' | 'professional'
) {
  const levelLabels = {
    general_worker: 'General Worker',
    semi_skilled: 'Semi-Skilled Worker',
    skilled_worker: 'Skilled Worker',
    professional: 'Professional'
  }

  const levelLabel = levelLabels[experienceLevel] || 'Applicant'

  try {
    console.log('📧 Sending welcome email to:', to)
    
    const result = await mg.messages.create(process.env.MAILGUN_DOMAIN || '', {
      from: `JustWork Mining <${process.env.MAILGUN_FROM_EMAIL || 'noreply@justwork.co.za'}>`,
      to: [to],
      subject: `Welcome to JustWork Mining, ${firstName}! 🎉`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .container {
                background: #f9f9f9;
                border-radius: 10px;
                padding: 30px;
                border: 2px solid #d97706;
              }
              .badge {
                background: #d97706;
                color: white;
                padding: 8px 16px;
                border-radius: 20px;
                display: inline-block;
                font-weight: bold;
                margin: 10px 0;
              }
              .button {
                display: inline-block;
                background: #d97706;
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 5px;
                margin: 20px 0;
                font-weight: bold;
              }
              ul {
                padding-left: 20px;
              }
              li {
                margin: 10px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🎉 Welcome to JustWork Mining!</h1>
              
              <p>Hi ${firstName},</p>
              
              <p>Your registration is complete! 🇿🇦⛏️</p>
              
              <span class="badge">${levelLabel}</span>
              
              <p><strong>What happens next:</strong></p>
              <ul>
                <li>💼 You'll receive WhatsApp notifications when new jobs matching your profile are posted</li>
                <li>📅 Get interview invitations directly on WhatsApp</li>
                <li>🎯 Receive job offers when companies want to hire you</li>
                <li>📄 Update your documents anytime via WhatsApp</li>
              </ul>
              
              <p><strong>Top Mining Companies Hiring:</strong></p>
              <ul>
                <li>⛏️ Anglo American</li>
                <li>⛏️ Sibanye-Stillwater</li>
                <li>⛏️ Gold Fields</li>
                <li>⛏️ Harmony Gold</li>
                <li>⛏️ Impala Platinum</li>
              </ul>
              
              <p>Keep your WhatsApp active to receive job notifications!</p>
              
              <a href="https://wa.me/27730899949" class="button">Message Us on WhatsApp</a>
              
              <p style="margin-top: 30px; font-size: 14px; color: #666;">
                <strong>Need help?</strong><br>
                Reply to this email or WhatsApp us at +27 73 089 9949
              </p>
            </div>
          </body>
        </html>
      `,
      text: `
Hi ${firstName},

Welcome to JustWork Mining!

Your registration is complete! 🇿🇦⛏️

Profile: ${levelLabel}

What happens next:
• You'll receive WhatsApp notifications when new jobs matching your profile are posted
• Get interview invitations directly on WhatsApp
• Receive job offers when companies want to hire you
• Update your documents anytime via WhatsApp

Top Mining Companies Hiring:
• Anglo American
• Sibanye-Stillwater
• Gold Fields
• Harmony Gold
• Impala Platinum

Keep your WhatsApp active to receive job notifications!

Message us: https://wa.me/27730899949

Need help?
Reply to this email or WhatsApp: +27 73 089 9949

© ${new Date().getFullYear()} JustWork Mining
      `.trim()
    })

    console.log('✅ Welcome email sent:', result)
    return result
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error)
    
    if (error && typeof error === 'object') {
      console.error('❌ Welcome email error details:', {
        message: (error as any).message,
        status: (error as any).status,
        details: (error as any).details
      })
    }
    
    // Don't throw - welcome email is optional
  }
}

// ═══════════════════════════════════════════════════════════════
// SEND JOB ALERT EMAIL
// ═══════════════════════════════════════════════════════════════
export async function sendJobAlertEmail(
  to: string,
  firstName: string,
  jobDetails: {
    jobTitle: string
    companyName: string
    location: string
    salaryMin: number
    salaryMax: number
    jobId: string
  }
) {
  try {
    console.log('📧 Sending job alert email to:', to)
    
    const result = await mg.messages.create(process.env.MAILGUN_DOMAIN || '', {
      from: `JustWork Mining Jobs <${process.env.MAILGUN_FROM_EMAIL || 'jobs@justwork.co.za'}>`,
      to: [to],
      subject: `New Job: ${jobDetails.jobTitle} at ${jobDetails.companyName}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .container {
                background: #ffffff;
                border-radius: 10px;
                padding: 30px;
                border: 2px solid #d97706;
              }
              .job-title {
                font-size: 24px;
                font-weight: bold;
                color: #d97706;
                margin: 20px 0;
              }
              .detail-row {
                padding: 10px 0;
                border-bottom: 1px solid #eee;
              }
              .button {
                display: inline-block;
                background: #d97706;
                color: white;
                padding: 15px 40px;
                text-decoration: none;
                border-radius: 5px;
                margin: 20px 0;
                font-weight: bold;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🔔 New Job Alert!</h1>
              
              <p>Hi ${firstName},</p>
              
              <p>A new position matching your profile is available:</p>
              
              <div class="job-title">📋 ${jobDetails.jobTitle}</div>
              
              <div class="detail-row">
                <strong>⛏️ Company:</strong> ${jobDetails.companyName}
              </div>
              <div class="detail-row">
                <strong>📍 Location:</strong> ${jobDetails.location}
              </div>
              <div class="detail-row">
                <strong>💰 Salary:</strong> R${jobDetails.salaryMin.toLocaleString()} - R${jobDetails.salaryMax.toLocaleString()}/month
              </div>
              
              <p style="margin-top: 30px;">
                <a href="https://justwork.co.za/mining/jobs/${jobDetails.jobId}" class="button">View Full Details</a>
              </p>
              
              <p>Or reply <strong>'APPLY ${jobDetails.jobId}'</strong> on WhatsApp to apply now!</p>
            </div>
          </body>
        </html>
      `
    })

    console.log('✅ Job alert email sent:', result)
    return result
  } catch (error) {
    console.error('❌ Failed to send job alert email:', error)
    // Don't throw - email is supplementary to WhatsApp
  }
}

// ═══════════════════════════════════════════════════════════════
// SEND INTERVIEW INVITATION EMAIL
// ═══════════════════════════════════════════════════════════════
export async function sendInterviewInvitationEmail(
  to: string,
  firstName: string,
  interviewDetails: {
    jobTitle: string
    companyName: string
    date: string
    time: string
    location: string
    contactNumber: string
  }
) {
  try {
    console.log('📧 Sending interview invitation email to:', to)
    
    const result = await mg.messages.create(process.env.MAILGUN_DOMAIN || '', {
      from: `JustWork Mining <${process.env.MAILGUN_FROM_EMAIL || 'noreply@justwork.co.za'}>`,
      to: [to],
      subject: `Interview Invitation: ${interviewDetails.jobTitle}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
              }
              .container {
                background: #f0fdf4;
                border-radius: 10px;
                padding: 30px;
                border: 2px solid #16a34a;
              }
              .highlight {
                background: #16a34a;
                color: white;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
              }
              .detail {
                margin: 10px 0;
                font-size: 16px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🎯 Interview Invitation!</h1>
              
              <p>Congratulations ${firstName}!</p>
              
              <p>You've been invited for an interview:</p>
              
              <div class="highlight">
                <div class="detail"><strong>📋 Position:</strong> ${interviewDetails.jobTitle}</div>
                <div class="detail"><strong>⛏️ Company:</strong> ${interviewDetails.companyName}</div>
                <div class="detail"><strong>📅 Date:</strong> ${interviewDetails.date}</div>
                <div class="detail"><strong>🕐 Time:</strong> ${interviewDetails.time}</div>
                <div class="detail"><strong>📍 Location:</strong> ${interviewDetails.location}</div>
              </div>
              
              <p><strong>What to bring:</strong></p>
              <ul>
                <li>Original ID Document</li>
                <li>Copies of all certificates</li>
                <li>Updated CV (if applicable)</li>
                <li>Reference letters (if available)</li>
              </ul>
              
              <p><strong>Questions?</strong> Call ${interviewDetails.contactNumber}</p>
              
              <p style="margin-top: 30px; color: #16a34a; font-weight: bold;">
                Confirm your attendance on WhatsApp!
              </p>
            </div>
          </body>
        </html>
      `
    })

    console.log('✅ Interview invitation email sent:', result)
    return result
  } catch (error) {
    console.error('❌ Failed to send interview invitation email:', error)
  }
}

// ═══════════════════════════════════════════════════════════════
// LEGACY FUNCTION (Keep for backward compatibility)
// ═══════════════════════════════════════════════════════════════
export async function sendVerificationEmail(
  to: string,
  code: string,
  firstName: string
) {
  // For mining, we don't use verification codes
  // But keep this for backward compatibility
  return sendIDVerificationEmail(to, firstName, '', '')
}