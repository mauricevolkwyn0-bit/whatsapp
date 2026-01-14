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
// JOB TITLES DATA (from your database)
// ═══════════════════════════════════════════════════════════════
const JOB_TITLES = [
    {
        id: "55ffbb89-14fa-4eb8-9f51-8ddcb5d2da42",
        category: "general_worker",
        title: "General Mine Worker",
        required_certificates: ["ID Document", "Medical Certificate"]
    },
    {
        id: "66bee395-d051-4e62-b2d0-342e4c8f0d75",
        category: "general_worker",
        title: "Surface Worker",
        required_certificates: ["ID Document", "Medical Certificate"]
    },
    {
        id: "e8aff06e-9373-4548-880a-a892b2aa4990",
        category: "general_worker",
        title: "Helper",
        required_certificates: ["ID Document"]
    },
    {
        id: "9b157f2f-fa57-42c4-8a4f-bd1ae7612185",
        category: "semi_skilled",
        title: "Drill Operator",
        required_certificates: ["Drill Operator Certificate", "Medical Certificate"]
    },
    {
        id: "dd61c9ba-7b5b-4693-ba69-f1e997cab316",
        category: "semi_skilled",
        title: "Machine Operator",
        required_certificates: ["Machine Operator License", "Safety Certificate"]
    },
    {
        id: "d0f481ed-2d91-4d08-8fc6-0aff60201687",
        category: "semi_skilled",
        title: "Winch Operator",
        required_certificates: ["Winch Operator Certificate"]
    },
    {
        id: "22668ddf-3acd-44c5-917d-02c55c3f414b",
        category: "semi_skilled",
        title: "Plant Operator",
        required_certificates: ["Plant Operator License"]
    },
    {
        id: "88cec300-a19f-4b9a-88bc-a69bc6357b62",
        category: "skilled",
        title: "Electrician",
        required_certificates: ["Trade Test Certificate", "Wireman License"]
    },
    {
        id: "5e6d9c95-2bd6-4dbd-a273-e5207d21aed0",
        category: "skilled",
        title: "Fitter",
        required_certificates: ["Trade Test Certificate"]
    },
    {
        id: "78453f90-c145-4ed5-922a-4f106ed2d06e",
        category: "skilled",
        title: "Welder",
        required_certificates: ["Trade Test Certificate", "Welding Certificate"]
    },
    {
        id: "4d6988f7-9995-4048-8569-3ebb5e630837",
        category: "skilled",
        title: "Boilermaker",
        required_certificates: ["Trade Test Certificate"]
    },
    {
        id: "dd4a2bd7-677b-4310-8a04-683de46599e0",
        category: "skilled",
        title: "Diesel Mechanic",
        required_certificates: ["Trade Test Certificate"]
    },
    {
        id: "bb0e14f4-28d7-41fa-9199-6e6800b58cc0",
        category: "skilled",
        title: "Artisan",
        required_certificates: ["Red Seal / Trade Test"]
    },
    {
        id: "ba99711e-e0b8-4ebd-99ba-225aaa9e7c50",
        category: "professional",
        title: "Mine Engineer",
        required_certificates: ["Engineering Degree", "Professional Registration"]
    },
    {
        id: "f76a8ba6-910e-4a9e-840b-17c88684d473",
        category: "professional",
        title: "Safety Officer",
        required_certificates: ["Safety Management Certificate", "SAMTRAC"]
    },
    {
        id: "6e64ffad-c71a-433b-a97e-8291d7dbfd22",
        category: "professional",
        title: "Mine Supervisor",
        required_certificates: ["Blasting Certificate", "Supervisory Certificate"]
    },
    {
        id: "0107ae38-bb4e-479b-b7b6-b821ecf8d02f",
        category: "professional",
        title: "Shift Boss",
        required_certificates: ["Blasting Certificate", "Mine Managers Certificate"]
    },
    {
        id: "1635255c-00cb-461c-8b83-aa55d82771a6",
        category: "professional",
        title: "Mine Manager",
        required_certificates: ["Mine Managers Certificate of Competency"]
    },
    {
        id: "d3e3d82e-0dbf-4d5e-a31a-9b6b35efe83d",
        category: "professional",
        title: "Surveyor",
        required_certificates: ["Surveying Degree", "Professional Registration"]
    }
]

// ═══════════════════════════════════════════════════════════════
// GET - WEBHOOK VERIFICATION
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 })
    }

    return new Response('Forbidden', { status: 403 })
}

// ═══════════════════════════════════════════════════════════════
// POST - INCOMING MESSAGES
// ═══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0]
        if (!message) return NextResponse.json({ success: true })

        const from = message.from
        const messageText = message.text?.body || ''
        const messageType = message.type

        console.log(`💬 From ${from}: "${messageText}" (${messageType})`)

        const state = await getConversationState(from)
        const currentState = (state?.current_state as ConversationState) || 'IDLE'
        const stateData = state?.data || {}

        if (messageType === 'text') {
            await handleTextMessage(from, messageText, currentState, stateData)
        } else if (messageType === 'interactive') {
            await handleInteractiveMessage(from, message, currentState, stateData)
        } else if (messageType === 'image' || messageType === 'document') {
            await handleDocumentMessage(from, message, currentState, stateData)
        } else if (messageType === 'location') {
            // Handle location sharing
            await handleLocationMessage(from, message, currentState, stateData)
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

        case 'APPLICANT_REG_LOCATION':
            await handleApplicantRegLocation(from, text, stateData)
            break

        case 'UPLOADING_REQUIRED_DOCS':
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
// NEW FLOW: STEP 1 - GREETING → ID NUMBER
// ═══════════════════════════════════════════════════════════════
async function handleGreeting(from: string) {
    const applicant = await getApplicantByWhatsApp(from)

    if (!applicant) {
        // NEW USER - Ask for consent first
        await updateConversationState(from, 'APPLICANT_REG_CONSENT', {})

        await sendInteractiveButtons(from,
            `👋 *Welcome to JustWork Mining!*

South Africa's leading mining recruitment platform 🇿🇦⛏️

*Are you sure you will allow us to capture your personal information?*`,
            [
                { id: 'consent_yes', title: '✅ Yes' },
                { id: 'consent_no', title: '❌ No' }
            ]
        )
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
// NEW FLOW: STEP 2 - ID NUMBER → ID UPLOAD
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

    // ✅ Use their actual name from Home Affairs
    await sendTextMessage(from,
        `✅ *Welcome ${homeAffairs.first_name} ${homeAffairs.last_name}!*

Your details have been verified.

📄 Please upload a clear photo of your *ID Document* (both sides if applicable):`)
}

// ═══════════════════════════════════════════════════════════════
// NEW FLOW: STEP 3 - ID UPLOAD → SELFIE
// ═══════════════════════════════════════════════════════════════
async function handleDocumentMessage(
    from: string,
    message: any,
    currentState: ConversationState,
    stateData: any
) {
    const imageId = message.image?.id || message.document?.id

    if (!imageId) {
        await sendTextMessage(from, `Please upload as an image or PDF.`)
        return
    }

    // STEP 3A: ID Document upload
    if (currentState === 'APPLICANT_REG_ID_UPLOAD') {
        try {
            console.log('📥 Downloading ID document...')
            const docData = await downloadDocumentAsBase64(imageId, 'id_document')

            await updateConversationState(from, 'APPLICANT_REG_SELFIE', {
                ...stateData,
                id_document: docData
            })

            await sendTextMessage(from,
                `✅ ID document received!

📸 Now please upload a *selfie* (photo of your face):

This helps us verify your identity.`)
        } catch (error) {
            console.error('❌ Upload failed:', error)
            await sendTextMessage(from, `❌ Upload failed. Please try again.`)
        }
        return
    }

    // STEP 3B: Selfie upload → Email
    if (currentState === 'APPLICANT_REG_SELFIE') {
        try {
            console.log('📥 Downloading selfie...')
            const docData = await downloadDocumentAsBase64(imageId, 'selfie')

            await updateConversationState(from, 'APPLICANT_REG_EMAIL', {
                ...stateData,
                selfie: docData
            })

            await sendTextMessage(from,
                `✅ Selfie received!

📧 Please enter your *email address*:`)
        } catch (error) {
            console.error('❌ Upload failed:', error)
            await sendTextMessage(from, `❌ Upload failed. Please try again.`)
        }
        return
    }

    // STEP 7: Required documents upload
    if (currentState === 'UPLOADING_REQUIRED_DOCS') {
        await processDocumentUpload(from, message, currentState, stateData)
    }
}

// ═══════════════════════════════════════════════════════════════
// NEW FLOW: STEP 4 - EMAIL → LOCATION
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

    await updateConversationState(from, 'APPLICANT_REG_LOCATION', {
        ...stateData,
        email: emailLower
    })

    await sendTextMessage(from,
        `✅ Email saved: ${emailLower}

📍 Please enter your *location* (city/town):

Example: Johannesburg, Rustenburg, Kimberley`)
}

// ═══════════════════════════════════════════════════════════════
// HANDLE LOCATION MESSAGE (WhatsApp location sharing)
// ═══════════════════════════════════════════════════════════════
async function handleLocationMessage(
    from: string,
    message: any,
    currentState: ConversationState,
    stateData: any
) {
    // If user shares their location during location step
    if (currentState === 'APPLICANT_REG_LOCATION') {
        const location = message.location
        const locationString = `${location.latitude}, ${location.longitude}`
        
        // For now, just tell them to type their city name instead
        await sendTextMessage(from,
            `📍 Location received, but please type your *city/town name* instead:

Example: Johannesburg, Rustenburg, Kimberley`)
        return
    }

    // Ignore location messages in other states
    console.log('⚠️ Location message received in unexpected state:', currentState)
}

// ═══════════════════════════════════════════════════════════════
// NEW FLOW: STEP 5 - LOCATION → CATEGORY SELECTION
// ═══════════════════════════════════════════════════════════════
async function handleApplicantRegLocation(from: string, location: string, stateData: any) {
    const locationClean = sanitizeInput(location)

    await updateConversationState(from, 'APPLICANT_REG_SELECTING_CATEGORY', {
        ...stateData,
        location: locationClean
    })

    await sendInteractiveList(from,
        `📋 *Select Your Category*

What type of work are you looking for?`,
        'Choose Category',
        [
            {
                title: '⚒️ Mining Categories',
                rows: [
                    { id: 'general_worker', title: '🔧 General Worker', description: 'Entry-level positions' },
                    { id: 'semi_skilled', title: '⚙️ Semi-Skilled', description: 'Operators & drillers' },
                    { id: 'skilled', title: '👷 Skilled', description: 'Artisans & technicians' },
                    { id: 'professional', title: '👔 Professional', description: 'Engineers & managers' }
                ]
            }
        ]
    )
}

// ═══════════════════════════════════════════════════════════════
// NEW FLOW: STEP 6 - CATEGORY → TITLE SELECTION
// ═══════════════════════════════════════════════════════════════
async function handleInteractiveMessage(
    from: string,
    message: any,
    currentState: ConversationState,
    stateData: any
) {
    const buttonId = message.interactive?.button_reply?.id || message.interactive?.list_reply?.id

    console.log(`Button: ${buttonId} (state: ${currentState})`)

    // Consent selection → Handle Yes/No
    if (currentState === 'APPLICANT_REG_CONSENT') {
        await handleConsentSelection(from, buttonId, stateData)
        return
    }

    // Category selection → Show titles
    if (currentState === 'APPLICANT_REG_SELECTING_CATEGORY') {
        await handleCategorySelection(from, buttonId, stateData)
        return
    }

    // Title selection → Show required documents
    if (currentState === 'APPLICANT_REG_SELECTING_TITLE') {
        await handleTitleSelection(from, buttonId, stateData)
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
// NEW FLOW: CONSENT SELECTION
// ═══════════════════════════════════════════════════════════════
async function handleConsentSelection(from: string, buttonId: string, stateData: any) {
    if (buttonId === 'consent_yes') {
        // User consented - proceed to ID number
        await updateConversationState(from, 'APPLICANT_REG_ID_NUMBER', {})
        
        await sendTextMessage(from,
            `✅ Thank you for your consent!

Let's get you registered!

Please enter your *13-digit SA ID number*:

Example: 9201015800089`)
    } else if (buttonId === 'consent_no') {
        // User declined - thank them and stop
        await updateConversationState(from, 'IDLE', {})
        
        await sendTextMessage(from,
            `Thank you for your interest in JustWork Mining!

If you change your mind, feel free to message us anytime. 👋`)
    }
}

async function handleCategorySelection(from: string, category: string, stateData: any) {
    const titlesForCategory = JOB_TITLES.filter(job => job.category === category)

    if (titlesForCategory.length === 0) {
        await sendTextMessage(from, `❌ No titles found for this category.`)
        return
    }

    await updateConversationState(from, 'APPLICANT_REG_SELECTING_TITLE', {
        ...stateData,
        selected_category: category
    })

    // ✅ FIX: Truncate titles and descriptions to meet WhatsApp limits
    const rows = titlesForCategory.map(job => {
        let displayTitle = job.title
        
        // WhatsApp limit: title must be 1-24 characters
        if (displayTitle.length > 24) {
            displayTitle = displayTitle.substring(0, 21) + '...'
        }
        
        // WhatsApp limit: description must be 1-72 characters
        const certCount = job.required_certificates.length
        const certWord = certCount === 1 ? 'cert' : 'certs'
        
        return {
            id: job.id,
            title: displayTitle,
            description: `${certCount} ${certWord} required`
        }
    }).slice(0, 10) // WhatsApp limit: max 10 rows per section

    // ✅ Also truncate section title (24 char limit)
    let sectionTitle = getCategoryLabel(category)
    
    // Remove emojis first to save space
    sectionTitle = sectionTitle.replace(/[🔧⚙️👷👔]/g, '').trim()
    
    if (sectionTitle.length > 24) {
        sectionTitle = sectionTitle.substring(0, 21) + '...'
    }

    await sendInteractiveList(from,
        `📋 *Select Your Job Title*

Choose the position you're qualified for:`,
        'Choose Title',
        [
            {
                title: sectionTitle,
                rows: rows
            }
        ]
    )
}

// ═══════════════════════════════════════════════════════════════
// NEW FLOW: STEP 7 - TITLE → REQUIRED DOCUMENTS
// ═══════════════════════════════════════════════════════════════
async function handleTitleSelection(from: string, titleId: string, stateData: any) {
    const selectedJob = JOB_TITLES.find(job => job.id === titleId)

    if (!selectedJob) {
        await sendTextMessage(from, `❌ Invalid title selection.`)
        return
    }

    // Get required documents (excluding ID Document which they already uploaded)
    const requiredDocs = selectedJob.required_certificates.filter(
        doc => doc !== 'ID Document'
    )

    await updateConversationState(from, 'UPLOADING_REQUIRED_DOCS', {
        ...stateData,
        selected_title_id: titleId,
        selected_title: selectedJob.title,
        selected_category: selectedJob.category,
        pending_documents: requiredDocs,
        uploaded_documents: {}
    })

    const docList = requiredDocs.map((doc, i) => `${i + 1}. ${doc}`).join('\n')

    if (requiredDocs.length === 0) {
        // No additional documents required
        await sendTextMessage(from,
            `✅ *${selectedJob.title}* selected!

No additional documents required.

Completing your registration...`)
        
        await completeApplicantRegistration(from, stateData)
        return
    }

    await sendTextMessage(from,
        `✅ *${selectedJob.title}* selected!

📄 *Required Documents:*
${docList}

Please upload: *${requiredDocs[0]}*

Send as image or PDF (or type 'SKIP'):`)
}

// ═══════════════════════════════════════════════════════════════
// PROCESS DOCUMENT UPLOAD
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
        console.log(`📥 Downloading ${currentDoc}...`)
        const docData = await downloadDocumentAsBase64(imageId, currentDoc)

        const uploadedDocs = stateData.uploaded_documents || {}
        uploadedDocs[currentDoc] = docData

        const remainingDocs = pendingDocs.slice(1)

        // Last document? Complete registration
        if (remainingDocs.length === 0) {
            console.log('✅ All documents collected! Completing registration...')
            await completeApplicantRegistration(from, { 
                ...stateData, 
                uploaded_documents: uploadedDocs 
            })
            return
        }

        // More documents needed
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

async function skipCurrentDocument(from: string, currentState: ConversationState, stateData: any) {
    const pendingDocs = stateData.pending_documents || []
    const remainingDocs = pendingDocs.slice(1)

    if (remainingDocs.length === 0) {
        console.log('✅ All documents processed! Completing registration...')
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
// DOWNLOAD DOCUMENT AS BASE64
// ═══════════════════════════════════════════════════════════════
async function downloadDocumentAsBase64(
    mediaId: string,
    documentType: string
): Promise<{ base64: string; mimeType: string; fileName: string }> {
    try {
        const mediaInfoResponse = await fetch(
            `https://graph.facebook.com/v22.0/${mediaId}`,
            {
                headers: {
                    'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                },
            }
        )

        if (!mediaInfoResponse.ok) {
            throw new Error(`WhatsApp API error: ${mediaInfoResponse.status}`)
        }

        const mediaInfo = await mediaInfoResponse.json()

        const mediaResponse = await fetch(mediaInfo.url, {
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
            },
        })

        if (!mediaResponse.ok) {
            throw new Error(`Failed to download file: ${mediaResponse.status}`)
        }

        const fileBuffer = await mediaResponse.arrayBuffer()
        const base64 = Buffer.from(fileBuffer).toString('base64')
        
        const fileExtension = getFileExtension(mediaInfo.mime_type)
        const fileName = `${sanitizeFileName(documentType)}_${Date.now()}${fileExtension}`

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
// COMPLETE REGISTRATION (UPLOAD ALL DOCUMENTS NOW)
// ═══════════════════════════════════════════════════════════════
async function completeApplicantRegistration(from: string, stateData: any) {
    try {
        const supabase = getSupabaseServer()

        console.log('🎯 [REGISTRATION] Starting final registration...')

        // Create auth user
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

        // Create base profile
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
                street_address: stateData.location,
                available_immediately: true,
                id_verified: true,
                job_title_id: stateData.selected_title_id
            })
            .select()
            .single()

        if (applicantError) throw applicantError

        console.log('☁️ [REGISTRATION] NOW uploading all documents...')
        
        // Combine all documents
        const allDocuments: Record<string, any> = {
            'ID Document': stateData.id_document,
            'Selfie': stateData.selfie,
            ...(stateData.uploaded_documents || {})
        }

        // Upload to Supabase Storage
        const documentUrls = await uploadAllDocumentsToStorage(
            allDocuments,
            applicant.id,
            supabase
        )

        // Link documents to applicant
        if (Object.keys(documentUrls).length > 0) {
            const documentInserts = Object.entries(documentUrls).map(([docType, docUrl]) => ({
                applicant_id: applicant.id,
                document_type: getDocumentTypeEnum(docType),
                document_name: docType,
                document_url: docUrl,
                status: 'pending' as any,
                uploaded_at: new Date().toISOString()
            }))

            await supabase.from('applicant_documents').insert(documentInserts)
        }

        await updateConversationState(from, 'IDLE', {
            applicant_id: applicant.id,
            user_type: 'applicant' as any
        })

        // Send welcome email
        try {
            await sendWelcomeEmail(stateData.email, stateData.first_name, stateData.selected_category)
        } catch (e) {
            console.error('⚠️ Welcome email failed:', e)
        }

        await sendTextMessage(from,
            `🎉 *Registration Complete!*

Welcome ${stateData.first_name}!

Position: *${stateData.selected_title}*
Location: ${stateData.location}

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
        console.error('❌ [REGISTRATION] Failed:', error)
        await sendTextMessage(from, 
            `❌ Registration failed. Please type 'MENU' to try again.`)
    }
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD ALL DOCUMENTS TO STORAGE
// ═══════════════════════════════════════════════════════════════
async function uploadAllDocumentsToStorage(
    documents: Record<string, { base64: string; mimeType: string; fileName: string }>,
    applicantId: string,
    supabase: any
): Promise<Record<string, string>> {
    const uploadedUrls: Record<string, string> = {}

    for (const [docType, docData] of Object.entries(documents)) {
        if (!docData || !docData.base64) continue

        const fileBuffer = Buffer.from(docData.base64, 'base64')
        const storagePath = `${applicantId}/${docData.fileName}`

        const { error } = await supabase.storage
            .from('applicant-documents')
            .upload(storagePath, fileBuffer, {
                contentType: docData.mimeType,
                upsert: true,
            })

        if (error) throw error

        const { data: urlData } = supabase.storage
            .from('applicant-documents')
            .getPublicUrl(storagePath)

        uploadedUrls[docType] = urlData.publicUrl
    }

    return uploadedUrls
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function getFileExtension(mimeType: string): string {
    const mimeMap: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/heic': '.heic',
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
        'Selfie': 'selfie',
        'Medical Certificate': 'medical_certificate',
        'Drill Operator Certificate': 'drill_operator_certificate',
        'Machine Operator License': 'machine_operator_license',
        'Safety Certificate': 'safety_certificate',
        'Winch Operator Certificate': 'winch_operator_certificate',
        'Plant Operator License': 'plant_operator_license',
        'Trade Test Certificate': 'trade_test_certificate',
        'Wireman License': 'wireman_license',
        'Welding Certificate': 'welding_certificate',
        'Red Seal / Trade Test': 'red_seal',
        'Engineering Degree': 'engineering_degree',
        'Professional Registration': 'professional_registration',
        'Safety Management Certificate': 'safety_management_certificate',
        'SAMTRAC': 'samtrac',
        'Blasting Certificate': 'blasting_certificate',
        'Supervisory Certificate': 'supervisory_certificate',
        'Mine Managers Certificate': 'mine_managers_certificate',
        'Mine Managers Certificate of Competency': 'mine_managers_certificate',
        'Surveying Degree': 'surveying_degree',
    }
    return mapping[docName] || 'other'
}

function getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
        'general_worker': 'General Worker',      // 14 chars ✅
        'semi_skilled': 'Semi-Skilled',           // 12 chars ✅
        'skilled': 'Skilled Trades',              // 14 chars ✅
        'professional': 'Professional'            // 12 chars ✅
    }
    return labels[category] || category
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