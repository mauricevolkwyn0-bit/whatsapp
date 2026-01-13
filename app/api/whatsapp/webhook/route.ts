// app/api/whatsapp/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServer } from '@/lib/supabase/server'
import {
    sendTextMessage,
    sendInteractiveButtons,
    sendInteractiveList
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
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!

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
        uploaded_documents: {}  // ✅ Start with empty object
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
            console.log('📥 Downloading ID document as base64...')
            
            // ✅ Download as base64, store in conversation state (NOT in Supabase yet)
            const docData = await downloadDocumentAsBase64(imageId, 'id_document')

            await updateConversationState(from, 'APPLICANT_REG_EMAIL', {
                ...stateData,
                id_document: docData  // ✅ Store base64 in state
            })

            await sendTextMessage(from,
                `✅ ID document received!

📧 Please enter your *email address*:`)
        } catch (error) {
            console.error('❌ Upload failed:', error)
            await sendTextMessage(from, `❌ Upload failed. Please try again.`)
        }
        return
    }

    // Other documents during registration
    if (currentState.includes('UPLOADING_')) {
        await processDocumentUpload(from, message, currentState, stateData)
    }
}

// ═══════════════════════════════════════════════════════════════
// PROCESS DOCUMENT UPLOAD (STORES AS BASE64 IN STATE)
// ═══════════════════════════════════════════════════════════════
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
        console.log(`📥 Downloading ${currentDoc} as base64...`)
        
        // ✅ Download as base64, store in conversation state (NOT in Supabase yet)
        const docData = await downloadDocumentAsBase64(imageId, currentDoc)

        const uploadedDocs = stateData.uploaded_documents || {}
        uploadedDocs[currentDoc] = docData  // ✅ Store base64 data

        const remainingDocs = pendingDocs.slice(1)

        // ✅ If this was the last document, proceed to registration
        if (remainingDocs.length === 0) {
            console.log('✅ All documents collected! Starting registration...')
            await completeApplicantRegistration(from, { 
                ...stateData, 
                uploaded_documents: uploadedDocs 
            })
            return
        }

        // ✅ Still have documents to upload - update state
        await updateConversationState(from, currentState, {
            ...stateData,
            uploaded_documents: uploadedDocs,
            pending_documents: remainingDocs
        })

        await sendTextMessage(from,
            `✅ *${currentDoc}* received!

📄 Next: *${remainingDocs[0]}*

Upload now (or type 'SKIP'):`)
    } catch (error) {
        console.error('❌ Upload failed:', error)
        await sendTextMessage(from, `❌ Upload failed. Please try again.`)
    }
}

// ═══════════════════════════════════════════════════════════════
// SKIP CURRENT DOCUMENT
// ═══════════════════════════════════════════════════════════════
async function skipCurrentDocument(from: string, currentState: ConversationState, stateData: any) {
    const pendingDocs = stateData.pending_documents || []
    const remainingDocs = pendingDocs.slice(1)

    // ✅ If no more documents, proceed to registration
    if (remainingDocs.length === 0) {
        console.log('✅ All documents processed! Starting registration...')
        await completeApplicantRegistration(from, stateData)
        return
    }

    // ✅ Still have documents - continue to next
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
// DOWNLOAD DOCUMENT AS BASE64 (NOT UPLOADED TO SUPABASE YET)
// ═══════════════════════════════════════════════════════════════
async function downloadDocumentAsBase64(
    mediaId: string,
    documentType: string
): Promise<{ base64: string; mimeType: string; fileName: string }> {
    try {
        console.log('📥 [DOWNLOAD] Starting:', { mediaId, documentType })

        // Step 1: Get media info from WhatsApp
        const mediaInfoResponse = await fetch(
            `https://graph.facebook.com/v22.0/${mediaId}`,
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                },
            }
        )

        if (!mediaInfoResponse.ok) {
            const errorText = await mediaInfoResponse.text()
            console.error('❌ [DOWNLOAD] WhatsApp API error:', errorText)
            throw new Error(`WhatsApp API error: ${mediaInfoResponse.status}`)
        }

        const mediaInfo = await mediaInfoResponse.json()
        console.log('✅ [DOWNLOAD] Media info:', {
            mimeType: mediaInfo.mime_type,
            size: mediaInfo.file_size,
        })

        // Step 2: Download the actual file
        const mediaResponse = await fetch(mediaInfo.url, {
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            },
        })

        if (!mediaResponse.ok) {
            throw new Error(`Failed to download file: ${mediaResponse.status}`)
        }

        const fileBuffer = await mediaResponse.arrayBuffer()
        console.log('✅ [DOWNLOAD] File downloaded:', {
            sizeKB: (fileBuffer.byteLength / 1024).toFixed(2),
        })

        // Step 3: Convert to base64 (for storing in conversation state)
        const base64 = Buffer.from(fileBuffer).toString('base64')
        
        const fileExtension = getFileExtension(mediaInfo.mime_type)
        const fileName = `${sanitizeFileName(documentType)}_${Date.now()}${fileExtension}`

        console.log('✅ [DOWNLOAD] Converted to base64, stored in state')

        return {
            base64,
            mimeType: mediaInfo.mime_type,
            fileName,
        }
    } catch (error) {
        console.error('❌ [DOWNLOAD] Download failed:', error)
        throw error
    }
}

// ═══════════════════════════════════════════════════════════════
// COMPLETE REGISTRATION (NOW UPLOADS ALL DOCUMENTS TO STORAGE)
// ═══════════════════════════════════════════════════════════════
async function completeApplicantRegistration(from: string, stateData: any) {
    try {
        const supabase = getSupabaseServer()

        console.log('🎯 [REGISTRATION] Starting final registration...')

        // ═══════════════════════════════════════════════════════════
        // STEP 1: Create auth user
        // ═══════════════════════════════════════════════════════════
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

        if (authError) {
            console.error('❌ Auth creation failed:', authError)
            throw authError
        }

        console.log('✅ [REGISTRATION] Auth user created:', authUser.user.id)

        // ═══════════════════════════════════════════════════════════
        // STEP 2: Create base profile
        // ═══════════════════════════════════════════════════════════
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: authUser.user.id,
                user_type: 'applicant' as any,
                email: stateData.email,
                cellphone: from,
                status: 'active' as any
            })
            .select()
            .single()

        if (profileError) {
            console.error('❌ Profile creation failed:', profileError)
            throw profileError
        }

        console.log('✅ [REGISTRATION] Base profile created')

        // ═══════════════════════════════════════════════════════════
        // STEP 3: Create applicant profile
        // ═══════════════════════════════════════════════════════════
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

        if (applicantError) {
            console.error('❌ Applicant profile creation failed:', applicantError)
            throw applicantError
        }

        console.log('✅ [REGISTRATION] Applicant profile created')

        // ═══════════════════════════════════════════════════════════
        // ✅ STEP 4: NOW UPLOAD ALL DOCUMENTS TO SUPABASE STORAGE
        // ═══════════════════════════════════════════════════════════
        console.log('☁️ [REGISTRATION] NOW uploading documents to Supabase Storage...')
        
        // Combine ID document with other documents
        const allDocuments: Record<string, any> = {
            'ID Document': stateData.id_document,
            ...(stateData.uploaded_documents || {})
        }

        // Upload all documents to storage NOW
        const documentUrls = await uploadAllDocumentsToStorage(
            allDocuments,
            applicant.id,
            supabase
        )

        console.log('✅ [REGISTRATION] All documents uploaded to storage')

        // ═══════════════════════════════════════════════════════════
        // STEP 5: Link documents to applicant in database
        // ═══════════════════════════════════════════════════════════
        if (Object.keys(documentUrls).length > 0) {
            const documentInserts = Object.entries(documentUrls).map(([docType, docUrl]) => ({
                applicant_id: applicant.id,
                document_type: getDocumentTypeEnum(docType),
                document_name: docType,
                document_url: docUrl,
                status: 'pending' as any,
                uploaded_at: new Date().toISOString()
            }))

            const { error: docsError } = await supabase
                .from('applicant_documents')
                .insert(documentInserts)

            if (docsError) {
                console.error('⚠️ [REGISTRATION] Document linking failed:', docsError)
            } else {
                console.log('✅ [REGISTRATION] Documents linked to applicant')
            }
        }

        // ═══════════════════════════════════════════════════════════
        // STEP 6: Update conversation state
        // ═══════════════════════════════════════════════════════════
        await updateConversationState(from, 'IDLE', {
            applicant_id: applicant.id,
            user_type: 'applicant' as any
        })

        console.log('✅ [REGISTRATION] Registration complete!')

        // ═══════════════════════════════════════════════════════════
        // STEP 7: Send welcome email
        // ═══════════════════════════════════════════════════════════
        try {
            await sendWelcomeEmail(stateData.email, stateData.first_name, stateData.experience_level)
        } catch (e) {
            console.error('⚠️ [REGISTRATION] Welcome email failed:', e)
        }

        // ═══════════════════════════════════════════════════════════
        // STEP 8: Send success message
        // ═══════════════════════════════════════════════════════════
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
        console.error('❌ [REGISTRATION] Registration failed:', error)
        
        // ✅ On failure, everything stays in conversation state
        await sendTextMessage(from, 
            `❌ Registration failed. Please type 'MENU' to try again or contact support.`)
    }
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD ALL DOCUMENTS TO STORAGE (CALLED ONLY AT THE END)
// ═══════════════════════════════════════════════════════════════
async function uploadAllDocumentsToStorage(
    documents: Record<string, { base64: string; mimeType: string; fileName: string }>,
    applicantId: string,
    supabase: any
): Promise<Record<string, string>> {
    try {
        console.log('☁️ [UPLOAD] Uploading documents:', {
            count: Object.keys(documents).length,
            applicantId,
        })

        const uploadedUrls: Record<string, string> = {}

        // Upload each document
        for (const [docType, docData] of Object.entries(documents)) {
            // Skip if no document data
            if (!docData || !docData.base64) {
                console.log(`⏭️ [UPLOAD] Skipping ${docType} (no data)`)
                continue
            }

            console.log(`📤 [UPLOAD] Uploading ${docType}...`)

            // Convert base64 back to buffer
            const fileBuffer = Buffer.from(docData.base64, 'base64')
            
            // Storage path
            const storagePath = `${applicantId}/${docData.fileName}`

            // Upload to Supabase Storage
            const { data, error } = await supabase.storage
                .from('applicant-documents')
                .upload(storagePath, fileBuffer, {
                    contentType: docData.mimeType,
                    upsert: true,
                })

            if (error) {
                console.error(`❌ [UPLOAD] Failed to upload ${docType}:`, error)
                throw error
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('applicant-documents')
                .getPublicUrl(storagePath)

            uploadedUrls[docType] = urlData.publicUrl
            console.log(`✅ [UPLOAD] ${docType} uploaded`)
        }

        console.log('✅ [UPLOAD] All documents uploaded successfully!')
        return uploadedUrls
    } catch (error) {
        console.error('❌ [UPLOAD] Failed to upload documents:', error)
        throw error
    }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function getFileExtension(mimeType: string): string {
    const mimeMap: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/heic': '.heic',
        'image/webp': '.webp',
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    }
    
    return mimeMap[mimeType.toLowerCase()] || '.bin'
}

function sanitizeFileName(name: string): string {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
}

function getDocumentTypeEnum(docName: string): string {
    const mapping: Record<string, string> = {
        'ID Document': 'id_document',
        'Proof of Address': 'proof_of_address',
        'Matric Certificate': 'matric_certificate',
        'Trade Certificate': 'trade_certificate',
        'Trade Test Certificate': 'trade_test_certificate',
        'Blasting Certificate': 'blasting_certificate',
        'Medical Certificate': 'medical_certificate',
        'Degree/Diploma': 'degree',
        'Professional Registration': 'professional_registration',
        'CV': 'cv'
    }
    return mapping[docName] || 'other'
}

async function verifyWithHomeAffairs(idNumber: string) {
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