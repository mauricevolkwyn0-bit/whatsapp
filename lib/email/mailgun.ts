// lib/email/mailgun.ts
import formData from 'form-data'
import Mailgun from 'mailgun.js'

const mailgun = new Mailgun(formData)

const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY || '',
  url: 'https://api.mailgun.net' // Use EU endpoint if needed: https://api.eu.mailgun.net
})

export async function sendVerificationEmail(
  to: string,
  code: string,
  firstName: string
) {
  try {
    const result = await mg.messages.create(process.env.MAILGUN_DOMAIN || '', {
      from: `JUST WORK <${process.env.MAILGUN_FROM_EMAIL || 'noreply@justwork.co.za'}>`,
      to: [to],
      subject: 'Your JUST WORK Verification Code',
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
                background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%);
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
              .code-container {
                background: #f9f9f9;
                border: 2px dashed #0066cc;
                border-radius: 8px;
                padding: 20px;
                text-align: center;
                margin: 30px 0;
              }
              .code {
                font-size: 42px;
                font-weight: bold;
                letter-spacing: 10px;
                color: #0066cc;
                font-family: 'Courier New', monospace;
              }
              .expires {
                color: #666;
                font-size: 14px;
                margin-top: 10px;
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
                color: #0066cc;
                text-decoration: none;
              }
              .warning {
                background: #fff3cd;
                border-left: 4px solid #ffc107;
                padding: 12px 15px;
                margin: 20px 0;
                font-size: 14px;
              }
            </style>
          </head>
          <body>
            <div class="email-container">
              <div class="header">
                <h1>🔐 Verify Your Email</h1>
              </div>
              
              <div class="content">
                <p style="font-size: 16px; margin-bottom: 10px;">Hi <strong>${firstName}</strong>,</p>
                
                <p>Welcome to <strong>JUST WORK</strong>! 🇿🇦</p>
                
                <p>To complete your registration, please use the verification code below:</p>
                
                <div class="code-container">
                  <div class="code">${code}</div>
                  <div class="expires">⏰ Expires in 10 minutes</div>
                </div>
                
                <p>Enter this code in WhatsApp to activate your account and start posting jobs or finding work.</p>
                
                <div class="warning">
                  ⚠️ <strong>Didn't request this?</strong><br>
                  If you didn't sign up for JUST WORK, please ignore this email and the code will expire automatically.
                </div>
              </div>
              
              <div class="footer">
                <p>
                  <strong>Need help?</strong><br>
                  WhatsApp: <a href="https://wa.me/27730899949">+27 73 089 9949</a><br>
                  Email: <a href="mailto:support@justwork.co.za">support@justwork.co.za</a><br>
                  Web: <a href="https://justwork.co.za">justwork.co.za</a>
                </p>
                <p style="margin-top: 15px; color: #999;">
                  © ${new Date().getFullYear()} JUST WORK. All rights reserved.
                </p>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
Hi ${firstName},

Welcome to JUST WORK!

Your verification code is: ${code}

This code will expire in 10 minutes.

Enter this code in WhatsApp to complete your registration.

If you didn't request this code, please ignore this email.

Need help?
WhatsApp: +27 73 089 9949
Email: support@justwork.co.za
Web: justwork.co.za

© ${new Date().getFullYear()} JUST WORK
      `.trim()
    })

    console.log('✅ Verification email sent via Mailgun:', result)
    return result
  } catch (error) {
    console.error('❌ Mailgun error:', error)
    throw error
  }
}

// Optional: Send welcome email after registration
export async function sendWelcomeEmail(
  to: string,
  firstName: string,
  userType: 'client' | 'provider'
) {
  const welcomeMessage = userType === 'client'
    ? 'You can now post jobs and find trusted service providers across South Africa.'
    : 'You can now browse jobs and start earning by offering your services.'

  try {
    const result = await mg.messages.create(process.env.MAILGUN_DOMAIN || '', {
      from: `JUST WORK <${process.env.MAILGUN_FROM_EMAIL || 'noreply@justwork.co.za'}>`,
      to: [to],
      subject: `Welcome to JUST WORK, ${firstName}! 🎉`,
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
              }
              .button {
                display: inline-block;
                background: #0066cc;
                color: white;
                padding: 12px 30px;
                text-decoration: none;
                border-radius: 5px;
                margin: 20px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🎉 Welcome to JUST WORK!</h1>
              
              <p>Hi ${firstName},</p>
              
              <p>Your registration is complete! ${welcomeMessage}</p>
              
              <p><strong>What's next?</strong></p>
              <ul>
                ${userType === 'client' 
                  ? `
                    <li>📝 Post your first job via WhatsApp</li>
                    <li>👀 Review applications from providers</li>
                    <li>✅ Choose the best match for your needs</li>
                  `
                  : `
                    <li>🔍 Browse available jobs</li>
                    <li>💼 Submit competitive quotes</li>
                    <li>💰 Get paid for completed work</li>
                  `
                }
              </ul>
              
              <p>Simply message us on WhatsApp to get started:</p>
              <a href="https://wa.me/27730899949" class="button">Open WhatsApp</a>
              
              <p>Happy ${userType === 'client' ? 'hiring' : 'working'}! 🇿🇦</p>
            </div>
          </body>
        </html>
      `
    })

    console.log('✅ Welcome email sent:', result)
    return result
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error)
    // Don't throw - welcome email is optional
  }
}