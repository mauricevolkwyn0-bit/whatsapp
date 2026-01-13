// api/notifications/send-whatsapp/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { sendTextMessage } from '@/lib/whatsapp/api'

export async function POST(request: NextRequest) {
    try {
        const supabase = getSupabaseServer()

        // Get pending notifications from notification_queue
        // ⚠️ FIX: Updated to match actual schema - notification_queue uses 'user_id', not foreign key to profiles
        const { data: notifications, error } = await supabase
            .from('notification_queue')
            .select('*')
            .eq('channel', 'whatsapp')  // ✅ Added channel filter
            .eq('status', 'pending')     // ✅ Use status instead of whatsapp_sent
            .is('sent_at', null)         // ✅ Use sent_at instead of whatsapp_sent_at
            .limit(50)

        if (error) {
            console.error('❌ Query error:', error)
            throw error
        }

        console.log(`📤 Processing ${notifications?.length || 0} WhatsApp notifications`)

        let successCount = 0
        let failCount = 0

        for (const notification of notifications || []) {
            try {
                // ⚠️ FIX: Get applicant details separately using user_id
                const { data: applicant, error: applicantError } = await supabase
                    .from('applicant_profiles')
                    .select('whatsapp_number, first_name, last_name')
                    .eq('id', notification.user_id)
                    .single()

                if (applicantError || !applicant) {
                    console.log(`⚠️ Applicant not found for user ${notification.user_id}`)
                    
                    await supabase
                        .from('notification_queue')
                        .update({
                            status: 'failed',
                            failed_at: new Date().toISOString(),
                            failure_reason: 'Applicant not found',
                            retry_count: (notification.retry_count || 0) + 1
                        })
                        .eq('id', notification.id)
                    
                    failCount++
                    continue
                }

                const phone = applicant.whatsapp_number
                const firstName = applicant.first_name

                // ⚠️ FIX: Validate phone number format
                if (!phone || !phone.startsWith('+27') || phone.length !== 12) {
                    console.log(`⚠️ Invalid phone for user ${notification.user_id}: ${phone}`)
                    
                    await supabase
                        .from('notification_queue')
                        .update({
                            status: 'failed',
                            failed_at: new Date().toISOString(),
                            failure_reason: 'Invalid phone number format',
                            retry_count: (notification.retry_count || 0) + 1
                        })
                        .eq('id', notification.id)
                    
                    failCount++
                    continue
                }

                // Extract job details from data field (not metadata)
                const data = notification.data || {}
                
                let message = ''

                // ⚠️ FIX: Handle different notification types
                switch (notification.notification_type) {
                    case 'job_posted':
                    case 'job_match':
                        message = formatJobNotification(firstName, data)
                        break
                    
                    case 'interview_invitation':
                        message = formatInterviewNotification(firstName, data)
                        break
                    
                    case 'job_offer':
                        message = formatJobOfferNotification(firstName, data)
                        break
                    
                    case 'application_update':
                        message = formatApplicationUpdateNotification(firstName, data)
                        break
                    
                    case 'document_reminder':
                        message = formatDocumentReminderNotification(firstName, data)
                        break
                    
                    default:
                        // Use the pre-formatted message if available
                        message = notification.message || 'You have a new notification from JustWork Mining'
                }

                // Send WhatsApp message
                await sendTextMessage(phone, message)

                // ⚠️ FIX: Mark as sent using correct schema fields
                await supabase
                    .from('notification_queue')
                    .update({
                        status: 'sent',
                        sent_at: new Date().toISOString()
                    })
                    .eq('id', notification.id)

                successCount++
                console.log(`✅ Sent to ${phone} (${firstName})`)

                // Rate limiting: Wait 1 second between messages
                await new Promise(resolve => setTimeout(resolve, 1000))

            } catch (error) {
                console.error(`❌ Failed to send to ${notification.user_id}:`, error)
                
                const retryCount = (notification.retry_count || 0) + 1
                const shouldRetry = retryCount < (notification.max_retries || 3)
                
                // ⚠️ FIX: Update with proper retry logic
                await supabase
                    .from('notification_queue')
                    .update({
                        status: shouldRetry ? 'pending' : 'failed',
                        failed_at: shouldRetry ? null : new Date().toISOString(),
                        failure_reason: error instanceof Error ? error.message : 'Unknown error',
                        retry_count: retryCount
                    })
                    .eq('id', notification.id)
                
                failCount++
            }
        }

        return NextResponse.json({
            success: true,
            processed: notifications?.length || 0,
            sent: successCount,
            failed: failCount
        })

    } catch (error) {
        console.error('❌ WhatsApp notification processor error:', error)
        return NextResponse.json(
            { success: false, error: 'Processing failed' },
            { status: 500 }
        )
    }
}

// ═══════════════════════════════════════════════════════════════
// MESSAGE FORMATTING FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function formatJobNotification(firstName: string, data: any): string {
    const jobTitle = data.job_title || 'New position'
    const companyName = data.company_name || 'A mining company'
    const location = data.location || data.work_location || 'your area'
    const salaryMin = data.salary_min || 0
    const salaryMax = data.salary_max || salaryMin
    const jobId = data.job_id || ''

    return `🔔 *New Job Alert!*

Hi ${firstName}! A new position matching your profile is available:

📋 *${jobTitle}*
⛏️ ${companyName}
📍 ${location}
💰 R${Number(salaryMin).toLocaleString()}${salaryMax > salaryMin ? ` - R${Number(salaryMax).toLocaleString()}` : ''}/month

Reply 'APPLY ${jobId}' to apply now!

Or view details: https://justwork.co.za/mining/jobs/${jobId}`
}

function formatInterviewNotification(firstName: string, data: any): string {
    const jobTitle = data.job_title || 'Position'
    const companyName = data.company_name || 'The company'
    const date = data.interview_date || data.date || 'soon'
    const time = data.interview_time || data.time || 'TBC'
    const location = data.interview_location || data.location || 'TBC'
    const contactNumber = data.contact_number || ''
    const interviewId = data.interview_id || ''

    return `🎯 *Interview Invitation!*

Congratulations ${firstName}!

You've been invited for an interview:

📋 Position: *${jobTitle}*
⛏️ Company: ${companyName}
📅 Date: ${date}
🕐 Time: ${time}
📍 Location: ${location}

Reply 'CONFIRM ${interviewId}' to confirm

${contactNumber ? `Questions? Call: ${contactNumber}` : ''}`
}

function formatJobOfferNotification(firstName: string, data: any): string {
    const jobTitle = data.job_title || 'Position'
    const companyName = data.company_name || 'The company'
    const salary = data.salary || 0
    const startDate = data.start_date || 'TBC'
    const hrContact = data.hr_contact || ''
    const offerId = data.offer_id || ''

    return `🎉 *Job Offer!*

Congratulations ${firstName}!

You've received a job offer:

📋 Position: *${jobTitle}*
⛏️ Company: ${companyName}
💰 Salary: R${Number(salary).toLocaleString()}/month
📅 Start Date: ${startDate}

Reply 'ACCEPT ${offerId}' to accept

${hrContact ? `Questions? Call HR: ${hrContact}` : ''}`
}

function formatApplicationUpdateNotification(firstName: string, data: any): string {
    const jobTitle = data.job_title || 'Position'
    const status = data.status || 'updated'
    const companyName = data.company_name || 'The company'

    const statusMessages: Record<string, string> = {
        'shortlisted': '🎯 Great news! You\'ve been shortlisted',
        'rejected': '📋 Application update',
        'under_review': '👀 Your application is under review',
        'withdrawn': '📋 Application withdrawn'
    }

    const statusMessage = statusMessages[status] || '📋 Application update'

    return `${statusMessage}

Hi ${firstName},

Your application for *${jobTitle}* at ${companyName} has been ${status}.

${status === 'shortlisted' ? 'Expect to hear from us soon!' : ''}
${status === 'rejected' ? 'Thank you for your interest. Keep checking for new opportunities!' : ''}

Check WhatsApp for updates.`
}

function formatDocumentReminderNotification(firstName: string, data: any): string {
    const documentType = data.document_type || 'document'
    const expiryDays = data.days_until_expiry || 0

    return `📄 *Document Reminder*

Hi ${firstName},

Your ${documentType} is ${expiryDays > 0 ? `expiring in ${expiryDays} days` : 'expired'}.

Please upload an updated copy to keep your profile active.

Reply 'UPDATE' to update your documents.`
}

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECK ENDPOINT
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
    const supabase = getSupabaseServer()
    
    // ⚠️ FIX: Query using correct schema fields
    const { count } = await supabase
        .from('notification_queue')
        .select('*', { count: 'exact', head: true })
        .eq('channel', 'whatsapp')
        .eq('status', 'pending')
    
    return NextResponse.json({
        pending_notifications: count || 0,
        status: 'operational'
    })
}