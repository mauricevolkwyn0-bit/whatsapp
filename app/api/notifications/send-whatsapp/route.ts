import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import { sendTextMessage } from '@/lib/whatsapp/api'

export async function POST(request: NextRequest) {
    try {
        const supabase = getSupabaseServer()

        // Get pending notifications from notification_queue
        const { data: notifications, error } = await supabase
            .from('notification_queue')
            .select(`
                *,
                profiles!notification_queue_user_id_fkey(phone, first_name, last_name)
            `)
            .eq('type', 'job_posted')
            .eq('whatsapp_sent', false)
            .is('whatsapp_sent_at', null)
            .limit(50) // Process in batches to avoid rate limits

        if (error) {
            console.error('❌ Query error:', error)
            throw error
        }

        console.log(`📤 Processing ${notifications?.length || 0} WhatsApp notifications`)

        let successCount = 0
        let failCount = 0

        for (const notification of notifications || []) {
            try {
                const phone = notification.profiles?.phone
                const firstName = notification.profiles?.first_name

                if (!phone || !phone.startsWith('+')) {
                    console.log(`⚠️ Invalid phone for user ${notification.user_id}: ${phone}`)
                    
                    // Mark as failed
                    await supabase
                        .from('notification_queue')
                        .update({
                            whatsapp_sent: true, // Mark as "processed" even though failed
                            whatsapp_sent_at: new Date().toISOString(),
                            metadata: {
                                ...notification.metadata,
                                whatsapp_error: 'Invalid phone number'
                            }
                        })
                        .eq('id', notification.id)
                    
                    failCount++
                    continue
                }

                // Extract job details from metadata
                const meta = notification.metadata || {}
                const jobTitle = meta.job_title || 'New job'
                const budgetMin = meta.budget_min || 0
                const budgetMax = meta.budget_max || budgetMin
                const location = meta.location || 'your area'
                const distanceKm = meta.distance_km || 'near'
                const category = meta.category || 'work'

                // Craft WhatsApp message
                const message = `🔔 *New ${category} Job!*

Hi ${firstName}! A new job is available ${distanceKm} km from you.

📋 *${jobTitle}*
💰 Budget: R${budgetMin}${budgetMax > budgetMin ? ` - R${budgetMax}` : ''}
📍 ${location}

🔗 View & apply: https://justwork.co.za/jobs

Reply 'STOP' to disable alerts.`

                // Send WhatsApp message
                await sendTextMessage(phone, message)

                // Mark as sent
                await supabase
                    .from('notification_queue')
                    .update({
                        whatsapp_sent: true,
                        whatsapp_sent_at: new Date().toISOString()
                    })
                    .eq('id', notification.id)

                successCount++
                console.log(`✅ Sent to ${phone} (${firstName})`)

                // Rate limiting: Wait 1 second between messages
                await new Promise(resolve => setTimeout(resolve, 1000))

            } catch (error) {
                console.error(`❌ Failed to send to ${notification.user_id}:`, error)
                
                // Mark as failed
                await supabase
                    .from('notification_queue')
                    .update({
                        whatsapp_sent: true,
                        whatsapp_sent_at: new Date().toISOString(),
                        metadata: {
                            ...notification.metadata,
                            whatsapp_error: error instanceof Error ? error.message : 'Unknown error'
                        }
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

// Health check endpoint
export async function GET(request: NextRequest) {
    const supabase = getSupabaseServer()
    
    const { count } = await supabase
        .from('notification_queue')
        .select('*', { count: 'exact', head: true })
        .eq('whatsapp_sent', false)
    
    return NextResponse.json({
        pending_notifications: count || 0,
        status: 'operational'
    })
}