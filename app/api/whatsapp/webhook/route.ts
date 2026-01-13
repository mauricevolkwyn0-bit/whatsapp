// app/api/whatsapp/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import {
    sendTextMessage,
    sendInteractiveButtons,
    sendInteractiveList,
    downloadAndStoreDocument
} from '@/lib/whatsapp/api'
import {
    getConversationState,
    updateConversationState,
    ConversationState
} from '@/lib/whatsapp/state-manager'
import { 
    isValidEmail, 
    isValidSAIDNumber, 
    parseSAIDNumber,
    isValidSAAddress,
    sanitizeInput 
} from '@/lib/utils/validation'
import { 
    sendIDVerificationEmail, 
    sendWelcomeEmail 
} from '@/lib/email/mailgun'

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'justwork_mining_2025'

// ═══════════════════════════════════════════════════════════════
// EXPERIENCE LEVELS & REQUIRED DOCUMENTS
// ═══════════════════════════════════════════════════════════════
const EXPERIENCE_LEVELS = {
    general_worker: {
        label: '🔧 General Worker',
        description: 'Entry-level mining positions',
        required_documents: [
            'Proof of Address',
            'Matric Certificate'
        ]
    },
    semi_skilled: {
        label: '⚙️ Semi-Skilled Worker',
        description: 'Operators, drillers, etc.',
        required_documents: [
            'Proof of Address',
            'Matric Certificate',
            'Trade Certificate',
            'Medical Certificate'
        ]
    },
    skilled_worker: {
        label: '👷 Skilled Worker',
        description: 'Artisans, technicians, supervisors',
        required_documents: [
            'Proof of Address',
            'Matric Certificate',
            'Trade Test Certificate',
            'Blasting Certificate',
            'Medical Certificate',
            'CV'
        ]
    },
    professional: {
        label: '👔 Professional',
        description: 'Engineers, geologists, managers',
        required_documents: [
            'Proof of Address',
            'Matric Certificate',
            'Degree/Diploma',
            'Professional Registration',
            'Medical Certificate',
            'CV'
        ]
    }
}

// ═══════════════════════════════════════════════════════════════
// GET - WEBHOOK VERIFICATION (Required by Meta)
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    console.log('📞 Webhook verification:', { mode, token })

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified!')
        return new Response(challenge, { status: 200 })
    }

    console.log('❌ Verification failed!')
    return new Response('Forbidden', { status: 403 })
}

// ═══════════════════════════════════════════════════════════════
// POST - INCOMING MESSAGES
// ═══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        console.log('📨 Webhook:', JSON.stringify(body, null, 2))

        const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
        if (!message) return NextResponse.json({ success: true })

        const from = message.from
        const messageText = message.text?.body || ''
        const messageType = message.type

        console.log(`💬 From ${from}: "${messageText}" (${messageType})`)

        // Get conversation state
        const state = await getConversationState(from)
        const currentState = (state?.current_state as ConversationState) || 'IDLE'
        const stateData = state?.data || {}

        // Route message
        if (messageType === 'text') {
            await handleTextMessage(from, messageText, currentState, stateData)
        } else if (messageType === 'interactive') {
            await handleInteractiveMessage(from, message, currentState, stateData)
        } else if (messageType === 'image' || messageType === 'document') {
            await handleDocumentMessage(from, message, currentState, stateData)
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('❌ Webhook error:', error)
        return NextResponse.json({ success: false }, { status: 200 })
    }
}

// ═══════════════════════════════════════════════════════════════
// HANDLE TEXT MESSAGE
// ═══════════════════════════════════════════════════════════════
async function handleTextMessage(
    from: string,
    text: string,
    currentState: ConversationState,
    stateData: any
) {
    const textLower = text.toLowerCase().trim()

    // Global commands
    if (textLower === 'hi' || textLower === 'hello' || textLower === 'menu') {
        await handleGreeting(from)
        return
    }

    if (textLower === 'help') {
        await handleHelp(from)
        return
    }

    // State routing
    switch (currentState) {
        case 'IDLE':
            await handleIdleState(from, text, stateData)
            break

        case 'APPLICANT_REG_ID_NUMBER':
            await handleApplicantRegIDNumber(from, text, stateData)
            break

        case 'APPLICANT_REG_EMAIL':
            await handleApplicantRegEmail(from, text, stateData)
            break

        case 'APPLICANT_REG_ADDRESS':
            await handleApplicantRegAddress(from, text, stateData)
            break

        case 'UPLOADING_GENERAL_WORKER_DOCS':
        case 'UPLOADING_SEMI_SKILLED_DOCS':
        case 'UPLOADING_SKILLED_WORKER_DOCS':
        case 'UPLOADING_PROFESSIONAL_DOCS':
            if (textLower === 'skip') {
                await skipCurrentDocument(from, currentState, stateData)
            } else {
                await sendTextMessage(from, `Please upload the document as an image or PDF, or type 'SKIP' to continue without it.`)
            }
            break

        default:
            await sendTextMessage(from, `Type 'MENU' for options or 'HELP' for assistance.`)
    }
}

// ═══════════════════════════════════════════════════════════════
// HANDLE GREETING
// ═══════════════════════════════════════════════════════════════
async function handleGreeting(from: string) {
    const applicant = await getApplicantByWhatsApp(from)

    if (!applicant) {
        // NEW USER - Start registration
        await updateConversationState(from, 'APPLICANT_REG_ID_NUMBER', {})

        await sendTextMessage(from,
            `👋 *Welcome to JustWork Mining!*

South Africa's leading mining recruitment platform 🇿🇦⛏️

Let's get you registered!

Please enter your *13-digit SA ID number*:

Example: 9201015800089`)
        return
    }

    // EXISTING USER - Show menu
    const firstName = applicant.first_name || 'there'

    await updateConversationState(from, 'IDLE', {
        applicant_id: applicant.id,
        user_type: 'applicant' as any
    })

    await sendInteractiveButtons(from,
        `👋 *Hi ${firstName}!*

What would you like to do?`,
        [
            { id: 'view_jobs', title: '💼 Available Jobs' },
            { id: 'my_applications', title: '📋 My Applications' },
            { id: 'update_profile', title: '👤 Update Profile' }
        ]
    )
}

// ═══════════════════════════════════════════════════════════════
// REGISTRATION: ID NUMBER
// ═══════════════════════════════════════════════════════════════
async function handleApplicantRegIDNumber(from: string, idNumber: string, stateData: any) {
    const cleaned = idNumber.replace(/\s/g, '')

    if (!isValidSAIDNumber(cleaned)) {
        await sendTextMessage(from,
            `❌ Invalid ID number format.

Please enter a valid 13-digit SA ID number:`)
        return
    }

    const idInfo = parseSAIDNumber(cleaned)
    if (!idInfo) {
        await sendTextMessage(from, `❌ Could not validate ID. Please try again:`)
        return
    }

    // Mock Home Affairs verification
    const homeAffairs = await verifyWithHomeAffairs(cleaned)

    if (!homeAffairs.verified) {
        await sendTextMessage(from,
            `❌ ID not found in Home Affairs database.

Please verify and try again:`)
        return
    }

    await updateConversationState(from, 'APPLICANT_REG_ID_UPLOAD', {
        ...stateData,
        id_number: cleaned,
        first_name: homeAffairs.first_name,
        last_name: homeAffairs.last_name,
        date_of_birth: idInfo.dateOfBirth,
        age: idInfo.age,
        gender: idInfo.gender,
        home_affairs_verified: true
    })

    await sendTextMessage(from,
        `✅ *Welcome ${homeAffairs.first_name} ${homeAffairs.last_name}!*

Your details have been verified.

📄 Please upload a clear photo of your *ID Document* (both sides if applicable):`)
}

// ═══════════════════════════════════════════════════════════════
// REGISTRATION: EMAIL
// ═══════════════════════════════════════════════════════════════
async function handleApplicantRegEmail(from: string, email: string, stateData: any) {
    const emailLower = email.toLowerCase().trim()

    if (!isValidEmail(emailLower)) {
        await sendTextMessage(from, `❌ Invalid email. Please try again:`)
        return
    }

    // Send confirmation email
    try {
        await sendIDVerificationEmail(
            emailLower,
            stateData.first_name,
            stateData.last_name,
            stateData.id_number
        )
    } catch (error) {
        console.error('Email send failed:', error)
    }

    await updateConversationState(from, 'APPLICANT_REG_ADDRESS', {
        ...stateData,
        email: emailLower
    })

    await sendTextMessage(from,
        `✅ Email saved: ${emailLower}

📍 Please enter your *physical address*:

Example: 123 Main Street, Johannesburg, 2001`)
}

// ═══════════════════════════════════════════════════════════════
// REGISTRATION: ADDRESS
// ═══════════════════════════════════════════════════════════════
async function handleApplicantRegAddress(from: string, address: string, stateData: any) {
    const addressClean = sanitizeInput(address)

    if (!isValidSAAddress(addressClean)) {
        await sendTextMessage(from,
            `❌ Please enter a complete address (street, city, postal code):`)
        return
    }

    await updateConversationState(from, 'APPLICANT_REG_SELECTING_LEVEL', {
        ...stateData,
        physical_address: addressClean
    })

    await sendInteractiveList(from,
        `📋 *Select Your Experience Level*

This determines which positions you can apply for:`,
        'Choose Level',
        [
            {
                title: '⚒️ Mining Positions',
                rows: [
                    { id: 'general_worker', title: '🔧 General Worker', description: 'Entry-level' },
                    { id: 'semi_skilled', title: '⚙️ Semi-Skilled', description: 'Operators' },
                    { id: 'skilled_worker', title: '👷 Skilled Worker', description: 'Artisans' },
                    { id: 'professional', title: '👔 Professional', description: 'Engineers' }
                ]
            }
        ]
    )
}

// ═══════════════════════════════════════════════════════════════
// HANDLE INTERACTIVE MESSAGE
// ═══════════════════════════════════════════════════════════════
async function handleInteractiveMessage(
    from: string,
    message: any,
    currentState: ConversationState,
    stateData: any
) {
    const buttonId = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id

    console.log(`Button: ${buttonId} (state: ${currentState})`)

    // Experience level selection
    if (currentState === 'APPLICANT_REG_SELECTING_LEVEL') {
        await handleExperienceLevelSelection(from, buttonId, stateData)
        return
    }

    // Menu actions
    switch (buttonId) {
        case 'view_jobs':
            await viewAvailableJobs(from, stateData)
            break
        case 'my_applications':
            await viewMyApplications(from, stateData)
            break
        case 'update_profile':
            await startProfileUpdate(from, stateData)
            break
    }
}

// ═══════════════════════════════════════════════════════════════
// EXPERIENCE LEVEL SELECTION
// ═══════════════════════════════════════════════════════════════
async function handleExperienceLevelSelection(from: string, level: string, stateData: any) {
    const levelConfig = EXPERIENCE_LEVELS[level as keyof typeof EXPERIENCE_LEVELS]

    if (!levelConfig) {
        await sendTextMessage(from, `❌ Invalid selection.`)
        return
    }

    const uploadState = `UPLOADING_${level.toUpperCase()}_DOCS` as ConversationState

    await updateConversationState(from, uploadState, {
        ...stateData,
        experience_level: level,
        pending_documents: levelConfig.required_documents,
        uploaded_documents: {
            'ID Document': stateData.id_document_url
        }
    })

    const docList = levelConfig.required_documents.map((doc, i) => `${i + 1}. ${doc}`).join('\n')

    await sendTextMessage(from,
        `✅ *${levelConfig.label}* selected!

📄 *Required Documents:*
${docList}

Please upload: *${levelConfig.required_documents[0]}*

Send as image or PDF (or type 'SKIP'):`)
}

// ═══════════════════════════════════════════════════════════════
// HANDLE DOCUMENT UPLOAD
// ═══════════════════════════════════════════════════════════════
async function handleDocumentMessage(
    from: string,
    message: any,
    currentState: ConversationState,
    stateData: any
) {
    // ID Document upload
    if (currentState === 'APPLICANT_REG_ID_UPLOAD') {
        const imageId = message.image?.id || message.document?.id

        if (!imageId) {
            await sendTextMessage(from, `Please upload your ID as an image or PDF.`)
            return
        }

        try {
            const docUrl = await downloadAndStoreDocument(imageId, 'id_document')

            await updateConversationState(from, 'APPLICANT_REG_EMAIL', {
                ...stateData,
                id_document_url: docUrl
            })

            await sendTextMessage(from,
                `✅ ID document uploaded!

📧 Please enter your *email address*:`)
        } catch (error) {
            console.error('Upload failed:', error)
            await sendTextMessage(from, `❌ Upload failed. Please try again.`)
        }
        return
    }

    // Other documents during registration
    if (currentState.includes('UPLOADING_')) {
        await processDocumentUpload(from, message, currentState, stateData)
    }
}

async function processDocumentUpload(
    from: string,
    message: any,
    currentState: ConversationState,
    stateData: any
) {
    const imageId = message.image?.id || message.document?.id

    if (!imageId) {
        await sendTextMessage(from, `Please upload as image or PDF, or type 'SKIP'.`)
        return
    }

    const pendingDocs = stateData.pending_documents || []
    if (pendingDocs.length === 0) {
        await completeApplicantRegistration(from, stateData)
        return
    }

    const currentDoc = pendingDocs[0]

    try {
        const docUrl = await downloadAndStoreDocument(imageId, currentDoc, stateData.applicant_id)

        const uploadedDocs = stateData.uploaded_documents || {}
        uploadedDocs[currentDoc] = docUrl

        const remainingDocs = pendingDocs.slice(1)

        if (remainingDocs.length === 0) {
            await completeApplicantRegistration(from, { ...stateData, uploaded_documents: uploadedDocs })
            return
        }

        await updateConversationState(from, currentState, {
            ...stateData,
            uploaded_documents: uploadedDocs,
            pending_documents: remainingDocs
        })

        await sendTextMessage(from,
            `✅ *${currentDoc}* uploaded!

📄 Next: *${remainingDocs[0]}*

Upload now (or type 'SKIP'):`)
    } catch (error) {
        console.error('Upload failed:', error)
        await sendTextMessage(from, `❌ Upload failed. Please try again.`)
    }
}

async function skipCurrentDocument(from: string, currentState: ConversationState, stateData: any) {
    const pendingDocs = stateData.pending_documents || []
    const remainingDocs = pendingDocs.slice(1)

    if (remainingDocs.length === 0) {
        await completeApplicantRegistration(from, stateData)
        return
    }

    await updateConversationState(from, currentState, {
        ...stateData,
        pending_documents: remainingDocs
    })

    await sendTextMessage(from,
        `⏭️ Skipped.

📄 Next: *${remainingDocs[0]}*

Upload now (or type 'SKIP'):`)
}

// ═══════════════════════════════════════════════════════════════
// COMPLETE REGISTRATION
// ═══════════════════════════════════════════════════════════════
async function completeApplicantRegistration(from: string, stateData: any) {
    try {
        const supabase = getSupabaseServer()

        // Create auth user first
        const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
            email: stateData.email,
            phone: from,
            email_confirm: true,
            phone_confirm: true,
            user_metadata: {
                first_name: stateData.first_name,
                last_name: stateData.last_name,
                user_role: 'applicant'
            }
        })

        if (authError) throw authError

        // Create base profile (required for foreign key)
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: authUser.user.id,
                user_type: 'applicant' as any, // ✅ Force TypeScript to accept it
                email: stateData.email,
                cellphone: from,
                status: 'active' as any
            })
            .select()
            .single()

        if (profileError) throw profileError

        // Create applicant profile
        const { data: applicant, error: applicantError } = await supabase
            .from('applicant_profiles')
            .insert({
                id: profile.id,
                id_number: stateData.id_number,
                first_name: stateData.first_name,
                last_name: stateData.last_name,
                date_of_birth: stateData.date_of_birth,
                gender: stateData.gender,
                age: stateData.age,
                whatsapp_number: from,
                email_verified: true,
                street_address: stateData.physical_address,
                available_immediately: true,
                id_verified: true
            })
            .select()
            .single()

        if (applicantError) throw applicantError

        await updateConversationState(from, 'IDLE', {
            applicant_id: applicant.id,
            user_type: 'applicant' as any
        })

        // Send welcome email
        try {
            await sendWelcomeEmail(stateData.email, stateData.first_name, stateData.experience_level)
        } catch (e) {
            console.error('Welcome email failed:', e)
        }

        await sendTextMessage(from,
            `🎉 *Registration Complete!*

Welcome ${stateData.first_name}!

You'll receive WhatsApp notifications when:
• New jobs match your profile
• You're invited for interviews
• You receive job offers

Type 'JOBS' to see available positions!`)

        await new Promise(resolve => setTimeout(resolve, 2000))

        await sendInteractiveButtons(from,
            `What would you like to do?`,
            [
                { id: 'view_jobs', title: '💼 View Jobs' },
                { id: 'my_applications', title: '📋 My Applications' }
            ]
        )

    } catch (error) {
        console.error('❌ Registration failed:', error)
        await sendTextMessage(from, `❌ Registration failed. Please contact support.`)
    }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════
async function verifyWithHomeAffairs(idNumber: string) {
    // Mock - In production, integrate with Home Affairs API
    const idInfo = parseSAIDNumber(idNumber)
    return {
        verified: true,
        first_name: 'Thabo',
        last_name: 'Mokwena',
        id_number: idNumber,
        ...idInfo
    }
}

async function getApplicantByWhatsApp(phone: string) {
    const supabase = getSupabaseServer()
    const { data } = await supabase
        .from('applicant_profiles')
        .select('*')
        .eq('whatsapp_number', phone)
        .single()
    return data
}

async function handleIdleState(from: string, text: string, stateData: any) {
    if (text.toLowerCase().includes('job')) {
        await viewAvailableJobs(from, stateData)
    } else {
        await sendTextMessage(from, `Type 'MENU' for options.`)
    }
}

async function viewAvailableJobs(from: string, stateData: any) {
    await sendTextMessage(from, `💼 Job listings feature coming soon!`)
}

async function viewMyApplications(from: string, stateData: any) {
    await sendTextMessage(from, `📋 Applications feature coming soon!`)
}

async function startProfileUpdate(from: string, stateData: any) {
    await sendTextMessage(from, `👤 Profile update feature coming soon!`)
}

async function handleHelp(from: string) {
    await sendTextMessage(from,
        `🆘 *JustWork Mining Help*

Commands:
• MENU - Main menu
• HELP - This message

Support:
WhatsApp: +27 73 089 9949
Email: support@justwork.co.za`)
}