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
    updateStateData,
    ConversationState
} from '@/lib/whatsapp/state-manager'
import { isValidEmail, sanitizeInput, parseBudget } from '@/lib/utils/validation'
import { sendVerificationEmail, sendWelcomeEmail } from '@/lib/email/mailgun'

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'just_work_verify_2025'

// ═══════════════════════════════════════════════════════════════
// GET - WEBHOOK VERIFICATION (Required by Meta)
// ═══════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url)

    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    console.log('📞 Webhook verification attempt:', { mode, token })

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified successfully!')
        return new Response(challenge, { status: 200 })
    }

    console.log('❌ Webhook verification failed!')
    return new Response('Forbidden', { status: 403 })
}

// ═══════════════════════════════════════════════════════════════
// POST - INCOMING MESSAGES
// ═══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        console.log('📨 Incoming webhook:', JSON.stringify(body, null, 2))

        const entry = body.entry?.[0]
        const changes = entry?.changes?.[0]
        const value = changes?.value
        const message = value?.messages?.[0]

        if (!message) {
            return NextResponse.json({ success: true })
        }

        const from = message.from // Sender's WhatsApp number
        const messageText = message.text?.body || ''
        const messageType = message.type

        console.log(`💬 Message from ${from}: "${messageText}" (type: ${messageType})`)

        // Log message to database
        await logMessage(from, messageText, messageType)

        // Get current conversation state
        const state = await getConversationState(from)
        const currentState = (state?.current_state as ConversationState) || 'IDLE'
        const stateData = state?.data || {}

        // Route message based on type and state
        if (messageType === 'text') {
            await handleTextMessage(from, messageText, currentState, stateData)
        } else if (messageType === 'interactive') {
            await handleInteractiveMessage(from, message, currentState, stateData)
        } else if (messageType === 'image') {
            await handleImageMessage(from, message, currentState, stateData)
        } else if (messageType === 'document') {
            await handleDocumentMessage(from, message, currentState, stateData)  // ← Add this
        } else if (messageType === 'location') {
            await handleLocationMessage(from, message, currentState, stateData)
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('❌ Webhook error:', error)
        return NextResponse.json({ success: false, error: 'Internal error' }, { status: 200 })
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

    // ─────────────────────────────────────────────────────────────
    // GLOBAL COMMANDS (work regardless of state)
    // ─────────────────────────────────────────────────────────────
    if (textLower === 'hi' || textLower === 'hello' || textLower === 'menu') {
        await handleGreeting(from)
        return
    }

    if (textLower === 'help') {
        await handleHelp(from)
        return
    }

    // ─────────────────────────────────────────────────────────────
    // STATE-BASED ROUTING
    // ─────────────────────────────────────────────────────────────
    switch (currentState) {
        case 'IDLE':
            await handleIdleState(from, text)
            break

        case 'CHOOSING_USER_TYPE':
            // This shouldn't happen (handled by interactive buttons)
            await handleGreeting(from)
            break

        // ─────────────────────────────────────────────────────────
        // CLIENT REGISTRATION STATES
        // ─────────────────────────────────────────────────────────
        case 'CLIENT_REG_NAME':
            await handleClientRegName(from, text, stateData)
            break

        case 'CLIENT_REG_SURNAME':
            await handleClientRegSurname(from, text, stateData)
            break

        case 'CLIENT_REG_EMAIL':
            await handleClientRegEmail(from, text, stateData)
            break

        case 'CLIENT_REG_VERIFICATION':
            await handleClientRegVerification(from, text, stateData)
            break

        // ─────────────────────────────────────────────────────────
        // PROVIDER REGISTRATION STATES
        // ─────────────────────────────────────────────────────────
        case 'PROVIDER_REG_NAME':
            await handleProviderRegName(from, text, stateData)
            break

        case 'PROVIDER_REG_SURNAME':
            await handleProviderRegSurname(from, text, stateData)
            break

        case 'PROVIDER_REG_EMAIL':
            await handleProviderRegEmail(from, text, stateData)
            break

        case 'PROVIDER_REG_EXPERIENCE':
            await handleProviderExperience(from, text, stateData)
            break

        case 'PROVIDER_REG_CV':
            await handleProviderCV(from, text, stateData)
            break

        case 'PROVIDER_REG_PORTFOLIO':
            await handleProviderPortfolio(from, text, stateData)
            break

        case 'PROVIDER_REG_ADDRESS':
            await handleProviderAddress(from, text, stateData)
            break

        case 'PROVIDER_REG_VERIFICATION':
            await handleProviderRegVerification(from, text, stateData)
            break


        // ─────────────────────────────────────────────────────────
        // JOB POSTING STATES
        // ─────────────────────────────────────────────────────────
        case 'POSTING_JOB_TITLE':
            await handleJobTitle(from, text, stateData)
            break

        case 'POSTING_JOB_DESCRIPTION':
            await handleJobDescription(from, text, stateData)
            break

        case 'POSTING_JOB_BUDGET':
            await handleJobBudget(from, text, stateData)
            break

        case 'POSTING_JOB_LOCATION':
            await handleJobLocation(from, text, stateData)  // Add this handler
            break

        case 'POSTING_JOB_IMAGES':
            await handleJobImages(from, text, stateData)  // Add this handler
            break

        // Add more states as needed...

        default:
            await sendTextMessage(from,
                `I didn't understand that. Type 'MENU' to see options or 'HELP' for assistance.`
            )
    }
}

// ═══════════════════════════════════════════════════════════════
// HANDLE GREETING - CORRECTED FLOW
// ═══════════════════════════════════════════════════════════════
async function handleGreeting(from: string) {
    // Check if user exists in database
    const user = await getUserByWhatsApp(from)

    if (!user) {
        // ═══════════════════════════════════════════════════════════
        // NEW USER - Go DIRECTLY to registration
        // ═══════════════════════════════════════════════════════════
        console.log('New user detected, showing registration options')

        await updateConversationState(from, 'CHOOSING_USER_TYPE', {})

        await sendInteractiveButtons(from,
            `👋 *Welcome to JUST WORK!*

The fastest way to get work done in South Africa 🇿🇦

Let's get you registered!

*Are you:*`,
            [
                { id: 'client', title: '🙋  I need services' },
                { id: 'provider', title: '🔧 I offer services' }
            ]
        )
        return
    }

    // ═══════════════════════════════════════════════════════════
    // REGISTERED USER - Show personalized menu
    // ═══════════════════════════════════════════════════════════
    const userType = user.user_metadata?.user_type
    const firstName = user.user_metadata?.first_name || 'there'

    console.log(`Existing user: ${firstName} (${userType})`)

    if (userType === 'client') {
        await updateConversationState(from, 'IDLE', {
            userId: user.id,
            userType: 'client'
        })

        await sendInteractiveButtons(from,
            `👋 *Hi ${firstName}!*

What would you like to do?`,
            [
                { id: 'post_job', title: '📝 Post a Job' },
                { id: 'my_jobs', title: '📋 My Jobs' },
                { id: 'history', title: '📊 History' }
            ]
        )
    } else if (userType === 'provider') {
        await updateConversationState(from, 'IDLE', {
            userId: user.id,
            userType: 'provider'
        })

        await sendInteractiveButtons(from,
            `👋 *Hi ${firstName}!*

What would you like to do?`,
            [
                { id: 'find_jobs', title: '🔍 Find Jobs' },
                { id: 'my_jobs', title: '📋 My Jobs' },
                { id: 'earnings', title: '💰 Earnings' }
            ]
        )
    }
}

async function handleCategorySelected(from: string, categorySlug: string, stateData: any) {
    // Fetch category details from database
    const supabase = getSupabaseServer()
    const { data: category, error } = await supabase
        .from('job_categories')
        .select('*')
        .eq('slug', categorySlug)
        .single()

    if (error || !category) {
        console.error('❌ Category fetch error:', error)
        await sendTextMessage(from, `❌ Category not found. Please try again.`)
        await startJobPosting(from, stateData)
        return
    }

    console.log('✅ Category selected:', category.name)

    await updateConversationState(from, 'POSTING_JOB_TITLE', {
        ...stateData,
        category_id: category.id,
        category_name: category.name
    })

    await sendTextMessage(from,
        `Great! *${category.name}*

Now, briefly describe what you need done:

Example: "Fix leaking kitchen tap" or "Paint bedroom walls white"`)
}

// ═══════════════════════════════════════════════════════════════
// HANDLE INTERACTIVE MESSAGES (Button clicks)
// ═══════════════════════════════════════════════════════════════
async function handleInteractiveMessage(
    from: string,
    message: any,
    currentState: ConversationState,
    stateData: any
) {
    const buttonId = message.interactive?.button_reply?.id ||
        message.interactive?.list_reply?.id

    console.log(`Button/List clicked: ${buttonId} (state: ${currentState})`)

    // ─────────────────────────────────────────────────────────
    // HANDLE JOB CATEGORY SELECTION (must come BEFORE switch)
    // ─────────────────────────────────────────────────────────
    if (currentState === 'SELECTING_JOB_CATEGORY') {
        if (buttonId === 'more-categories') {
            await showMoreCategories(from, stateData)
            return
        }
        if (buttonId === 'back-to-main') {
            await startJobPosting(from, stateData)
            return
        }
        await handleCategorySelected(from, buttonId, stateData)
        return
    }

    // ─────────────────────────────────────────────────────────
    // HANDLE PROVIDER CATEGORY SELECTION (must come BEFORE switch)
    // ─────────────────────────────────────────────────────────
    if (currentState === 'PROVIDER_REG_CATEGORY') {
        if (buttonId === 'provider-more-categories') {
            await showProviderMoreCategories(from, stateData)
            return
        }
        if (buttonId === 'provider-back-to-main') {
            await handleProviderRegEmail(from, stateData.email, stateData)
            return
        }
        await handleProviderCategorySelected(from, buttonId, stateData)
        return
    }

    // ─────────────────────────────────────────────────────────
    // HANDLE ALL OTHER BUTTON CLICKS
    // ─────────────────────────────────────────────────────────
    switch (buttonId) {
        // ─────────────────────────────────────────────────────────
        // USER TYPE SELECTION (NEW USERS)
        // ─────────────────────────────────────────────────────────
        case 'client':
            await startClientRegistration(from)
            break

        case 'provider':
            await startProviderRegistration(from)
            break

        // ─────────────────────────────────────────────────────────
        // CLIENT ACTIONS
        // ─────────────────────────────────────────────────────────
        case 'post_job':
            await startJobPosting(from, stateData)
            break

        case 'my_jobs':
            await showMyJobs(from, stateData)
            break

        case 'history':
            await showHistory(from, stateData)
            break

        // ─────────────────────────────────────────────────────────
        // PROVIDER ACTIONS
        // ─────────────────────────────────────────────────────────
        case 'find_jobs':
            await findJobs(from, stateData)
            break

        case 'earnings':
            await showEarnings(from, stateData)
            break

        default:
            console.log(`Unknown button: ${buttonId}`)
    }
}

// ═══════════════════════════════════════════════════════════════
// CLIENT REGISTRATION FLOW
// ═══════════════════════════════════════════════════════════════
async function startClientRegistration(from: string) {
    await updateConversationState(from, 'CLIENT_REG_NAME', {
        user_type: 'client'
    })

    await sendTextMessage(from,
        `Great! Let's get you registered as a client.

What's your first name?`
    )
}

async function handleClientRegName(from: string, name: string, stateData: any) {
    const firstName = sanitizeInput(name)

    await updateConversationState(from, 'CLIENT_REG_SURNAME', {
        ...stateData,
        first_name: firstName
    })

    await sendTextMessage(from, `What's your surname?`)
}

async function handleClientRegSurname(from: string, surname: string, stateData: any) {
    const surnameSanitized = sanitizeInput(surname)

    await updateConversationState(from, 'CLIENT_REG_EMAIL', {
        ...stateData,
        surname: surnameSanitized
    })

    await sendTextMessage(from, `What's your email address?`)
}

async function handleClientRegEmail(from: string, email: string, stateData: any) {
    const emailLower = email.toLowerCase().trim()

    if (!isValidEmail(emailLower)) {
        await sendTextMessage(from,
            `That doesn't look like a valid email address. Please try again:`)
        return
    }

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()

    try {
        console.log('🔄 Attempting to send verification email to:', emailLower)
        console.log('📧 Verification code:', verificationCode)

        // Send verification email via Mailgun
        const emailResult = await sendVerificationEmail(emailLower, verificationCode, stateData.first_name)

        console.log('✅ Email sent successfully:', emailResult)

        await updateConversationState(from, 'CLIENT_REG_VERIFICATION', {
            ...stateData,
            email: emailLower,
            verification_code: verificationCode,
            verification_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        })

        await sendTextMessage(from,
            `📧 Verification code sent to ${emailLower}

Enter the 6-digit code (valid for 10 minutes):`
        )
    } catch (error) {
        // Enhanced error logging
        console.error('❌ FULL EMAIL ERROR:', error)
        console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            error: error
        })

        await sendTextMessage(from,
            `❌ Failed to send email. Please check your email address and try again.`)
    }
}

async function handleClientRegVerification(from: string, code: string, stateData: any) {
    const codeClean = code.trim()

    console.log('🔐 Verification attempt:', {
        from,
        providedCode: codeClean,
        expectedCode: stateData.verification_code,
        match: codeClean === stateData.verification_code
    })

    if (codeClean !== stateData.verification_code) {
        await sendTextMessage(from,
            `❌ Invalid code. Please try again or type 'MENU' to start over.`)
        return
    }

    // Create user in database
    try {
        console.log('👤 Starting user creation:', {
            email: stateData.email,
            phone: from,
            first_name: stateData.first_name,
            surname: stateData.surname
        })

        const supabase = getSupabaseServer()

        // Check if user already exists
        const { data: existingUsers } = await supabase.auth.admin.listUsers()
        const existingUser = existingUsers?.users.find(
            u => u.email === stateData.email || u.phone === from
        )

        let userId: string

        if (existingUser) {
            console.log('⚠️ User already exists:', existingUser.id)
            userId = existingUser.id

            // Update user metadata if needed
            const { error: updateError } = await supabase.auth.admin.updateUserById(
                existingUser.id,
                {
                    user_metadata: {
                        user_type: 'client',
                        first_name: stateData.first_name,
                        surname: stateData.surname,
                        full_name: `${stateData.first_name} ${stateData.surname}`,
                        whatsapp_number: from,
                        registered_via: 'whatsapp',
                        registered_at: existingUser.created_at
                    }
                }
            )

            if (updateError) {
                console.error('⚠️ Could not update user metadata:', updateError)
            }

        } else {
            // Create new auth user
            console.log('📝 Creating new auth user...')
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: stateData.email,
                phone: from,
                email_confirm: true,
                phone_confirm: true,
                user_metadata: {
                    user_type: 'client',
                    first_name: stateData.first_name,
                    surname: stateData.surname,
                    full_name: `${stateData.first_name} ${stateData.surname}`,
                    whatsapp_number: from,
                    registered_via: 'whatsapp',
                    registered_at: new Date().toISOString()
                }
            })

            if (authError) {
                console.error('❌ Auth error:', {
                    message: authError.message,
                    status: authError.status,
                    code: authError.code,
                    details: authError
                })
                throw authError
            }

            if (!authData || !authData.user) {
                console.error('❌ No auth data returned')
                throw new Error('No user data returned from auth')
            }

            userId = authData.user.id
            console.log('✅ Auth user created:', userId)
        }

        // ═══════════════════════════════════════════════════════════
        // CREATE BASE PROFILE (CRITICAL - Required for foreign keys)
        // ═══════════════════════════════════════════════════════════
        const { data: existingBaseProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()

        if (!existingBaseProfile) {
            console.log('📝 Creating base profile...')
            const { error: baseProfileError } = await supabase
                .from('profiles')
                .insert({
                    id: userId,
                    email: stateData.email,
                    phone: from,
                    first_name: stateData.first_name,
                    last_name: stateData.surname,  // ← Note: your table uses last_name, not surname
                    is_client: true,
                    is_provider: false,
                    active_role: 'client',
                    email_verified: true,
                    is_verified: false,  // Can be updated later after full verification
                    is_active: true,
                    is_suspended: false,
                    is_admin: false,
                    client_onboarding_completed: false,
                    provider_onboarding_completed: false,
                    preferred_contact_method: 'whatsapp',
                    country: 'ZA',  // South Africa
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    last_login_at: new Date().toISOString()
                })

            if (baseProfileError) {
                console.error('❌ Base profile error:', {
                    message: baseProfileError.message,
                    code: baseProfileError.code,
                    details: baseProfileError.details,
                    hint: baseProfileError.hint,
                    error: baseProfileError
                })
                throw baseProfileError
            }

            console.log('✅ Base profile created')
        } else {
            console.log('✅ Base profile already exists')

            // Update existing profile to ensure client role is set
            const { error: updateProfileError } = await supabase
                .from('profiles')
                .update({
                    is_client: true,
                    active_role: 'client',
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)

            if (updateProfileError) {
                console.error('⚠️ Could not update profile:', updateProfileError)
            }
        }

        // ═══════════════════════════════════════════════════════════
        // CREATE CLIENT PROFILE (extends base profile)
        // ═══════════════════════════════════════════════════════════
        const { data: existingClientProfile } = await supabase
            .from('client_profiles')
            .select('*')
            .eq('user_id', userId)
            .single()

        if (!existingClientProfile) {
            console.log('📝 Creating client profile...')
            const { data: profileData, error: profileError } = await supabase
                .from('client_profiles')
                .insert({
                    user_id: userId,
                    total_jobs_posted: 0,
                    total_jobs_completed: 0,
                    total_spent: 0
                })
                .select()

            if (profileError) {
                console.error('❌ Client profile error:', {
                    message: profileError.message,
                    code: profileError.code,
                    details: profileError.details,
                    hint: profileError.hint,
                    error: profileError
                })
                throw profileError
            }

            console.log('✅ Client profile created:', profileData)
        } else {
            console.log('✅ Client profile already exists')
        }

        // Update conversation state
        console.log('📝 Updating conversation state...')
        await updateConversationState(from, 'IDLE', {
            userId: userId,
            userType: 'client'
        })

        console.log('✅ Registration completed successfully!')

        // Send welcome email (only if new user)
        if (!existingUser) {
            try {
                await sendWelcomeEmail(
                    stateData.email,
                    stateData.first_name,
                    'client'
                )
            } catch (emailError) {
                console.error('⚠️ Welcome email failed (non-critical):', emailError)
            }
        }

        // Registration complete - SHOW INTERACTIVE BUTTONS
        await sendInteractiveButtons(from,
            `🎉 *${existingUser ? 'Welcome back' : 'Registration complete'}!*

Welcome ${stateData.first_name}! You can now:`,
            [
                { id: 'post_job', title: '📝 Post a Job' },
                { id: 'my_jobs', title: '📋 My Jobs' },
                { id: 'history', title: '📊 History' }
            ]
        )

    } catch (error) {
        console.error('❌ REGISTRATION FAILED:', error)
        console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            error: error
        })

        await sendTextMessage(from,
            `❌ Registration failed. Please try again later or contact support.`)
    }
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER REGISTRATION FLOW
// ═══════════════════════════════════════════════════════════════
async function startProviderRegistration(from: string) {
    await updateConversationState(from, 'PROVIDER_REG_NAME', {
        user_type: 'provider'
    })

    await sendTextMessage(from,
        `Excellent! Let's get you registered as a service provider.

What's your first name?`)
}

async function handleProviderRegName(from: string, name: string, stateData: any) {
    const firstName = sanitizeInput(name)

    await updateConversationState(from, 'PROVIDER_REG_SURNAME', {
        ...stateData,
        first_name: firstName
    })

    await sendTextMessage(from, `What's your surname?`)
}

async function handleProviderRegSurname(from: string, surname: string, stateData: any) {
    const surnameSanitized = sanitizeInput(surname)

    await updateConversationState(from, 'PROVIDER_REG_EMAIL', {
        ...stateData,
        surname: surnameSanitized
    })

    await sendTextMessage(from, `What's your email address?`)
}

async function handleProviderRegEmail(from: string, email: string, stateData: any) {
    const emailLower = email.toLowerCase().trim()

    if (!isValidEmail(emailLower)) {
        await sendTextMessage(from,
            `That doesn't look like a valid email address. Please try again:`)
        return
    }

    // Move to category selection
    await updateConversationState(from, 'PROVIDER_REG_CATEGORY', {
        ...stateData,
        email: emailLower
    })

    // Show category selection
    await sendInteractiveList(from,
        `📋 What type of services do you offer?

Select your main category:`,
        'Choose Category',
        [
            {
                title: '🏠 Home Services',
                rows: [
                    { id: 'general-handyman', title: 'General Handyman', description: 'Repairs & maintenance' },
                    { id: 'plumbing', title: 'Plumbing', description: 'Taps, pipes, geysers' },
                    { id: 'electrical-power', title: 'Electrical', description: 'Wiring & power' },
                    { id: 'painting-decorating', title: 'Painting', description: 'Interior & exterior' },
                    { id: 'cleaning-services', title: 'Cleaning', description: 'Home & office' },
                    { id: 'home-improvements-renovations', title: 'Renovations', description: 'Building work' }
                ]
            },
            {
                title: '🔧 Other Services',
                rows: [
                    { id: 'car-mechanic', title: 'Car Mechanic', description: 'Vehicle repairs' },
                    { id: 'moving-transport', title: 'Moving', description: 'Transport services' },
                    { id: 'provider-more-categories', title: '➕ More Categories', description: 'See all services' }
                ]
            }
        ]
    )
}

async function showProviderMoreCategories(from: string, stateData: any) {
    await sendInteractiveList(from,
        `📋 More Service Categories`,
        'Choose Category',
        [
            {
                title: '🏠 Home Services',
                rows: [
                    { id: 'furniture-assembly-repairs', title: 'Furniture Assembly', description: 'Flat-pack & repairs' },
                    { id: 'appliance-installations', title: 'Appliance Install', description: 'Stoves, gates' }
                ]
            },
            {
                title: '🚗 Automotive',
                rows: [
                    { id: 'panelbeating', title: 'Panelbeating', description: 'Dent repairs' }
                ]
            },
            {
                title: '👥 Personal Services',
                rows: [
                    { id: 'it-tech-support', title: 'IT & Tech', description: 'Tech support' },
                    { id: 'lessons-tutoring', title: 'Tutoring', description: 'Teaching' },
                    { id: 'care-wellness', title: 'Care & Wellness', description: 'Personal care' },
                    { id: 'events-catering', title: 'Events', description: 'Catering' },
                    { id: 'dog-breeding', title: 'Dog Breeding', description: 'Puppies' },
                    { id: 'provider-back-to-main', title: '⬅️ Back', description: 'Main categories' }
                ]
            }
        ]
    )
}

async function handleProviderCategorySelected(from: string, categorySlug: string, stateData: any) {
    const supabase = getSupabaseServer()
    const { data: category, error } = await supabase
        .from('job_categories')
        .select('*')
        .eq('slug', categorySlug)
        .single()

    if (error || !category) {
        console.error('❌ Category fetch error:', error)
        await sendTextMessage(from, `❌ Category not found. Please try again.`)
        return
    }

    await updateConversationState(from, 'PROVIDER_REG_EXPERIENCE', {
        ...stateData,
        category_id: category.id,
        category_name: category.name
    })

    await sendTextMessage(from,
        `Great! *${category.name}*

How many years of experience do you have in ${category.name}?

Type a number (e.g., "5" or "0" if just starting)`)
}

async function handleProviderExperience(from: string, experience: string, stateData: any) {
    const experienceYears = parseInt(experience.trim())

    if (isNaN(experienceYears) || experienceYears < 0 || experienceYears > 50) {
        await sendTextMessage(from,
            `Please enter a valid number of years (0-50):`)
        return
    }

    await updateConversationState(from, 'PROVIDER_REG_CV', {
        ...stateData,
        experience_years: experienceYears
    })

    await sendTextMessage(from,
        `Excellent! ${experienceYears} year${experienceYears !== 1 ? 's' : ''} of experience.

📄 Now, please upload your CV/Resume as a PDF or image.

You can also type 'skip' if you don't have one ready.`)
}

async function handleProviderCV(from: string, text: string, stateData: any) {
    const textLower = text.toLowerCase().trim()

    if (textLower === 'skip') {
        // Skip CV, move to portfolio
        await updateConversationState(from, 'PROVIDER_REG_PORTFOLIO', {
            ...stateData,
            cv_url: null
        })

        await sendTextMessage(from,
            `No problem! You can add your CV later.

📸 Now, upload photos of your previous work (portfolio).

Send images one by one, or type 'skip' if you don't have any yet.`)
        return
    }

    await sendTextMessage(from,
        `Please upload a document (PDF or image) or type 'skip' to continue.`)
}

async function handleProviderPortfolio(from: string, text: string, stateData: any) {
    const textLower = text.toLowerCase().trim()

    if (textLower === 'skip' || textLower === 'done') {
        // Move to address
        await updateConversationState(from, 'PROVIDER_REG_ADDRESS', {
            ...stateData
        })

        await sendTextMessage(from,
            `${textLower === 'skip' ? 'No problem! You can add portfolio images later.' : 'Great! Portfolio images saved.'}

📍 What area are you based in?

Example: "Sandton, Johannesburg" or "Cape Town CBD"`)
        return
    }

    await sendTextMessage(from,
        `Send more images or type 'done' when finished.`)
}

async function handleProviderAddress(from: string, address: string, stateData: any) {
    const addressClean = sanitizeInput(address)

    // Generate verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()

    try {
        // Send verification email
        await sendVerificationEmail(stateData.email, verificationCode, stateData.first_name)

        await updateConversationState(from, 'PROVIDER_REG_VERIFICATION', {
            ...stateData,
            address: addressClean,
            verification_code: verificationCode,
            verification_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        })

        await sendTextMessage(from,
            `Perfect! Based in ${addressClean}.

📧 Verification code sent to ${stateData.email}

Enter the 6-digit code (valid for 10 minutes):`)

    } catch (error) {
        console.error('❌ Email error:', error)
        await sendTextMessage(from,
            `❌ Failed to send verification email. Please try again later.`)
    }
}

async function handleProviderRegVerification(from: string, code: string, stateData: any) {
    const codeClean = code.trim()

    if (codeClean !== stateData.verification_code) {
        await sendTextMessage(from,
            `❌ Invalid code. Please try again or type 'MENU' to start over.`)
        return
    }

    try {
        const supabase = getSupabaseServer()

        console.log('👤 Creating provider:', {
            email: stateData.email,
            phone: from,
            category: stateData.category_name
        })

        // Check if user exists
        const { data: existingUsers } = await supabase.auth.admin.listUsers()
        const existingUser = existingUsers?.users.find(
            u => u.email === stateData.email || u.phone === from
        )

        let userId: string

        if (existingUser) {
            console.log('⚠️ User already exists:', existingUser.id)
            userId = existingUser.id

            // Update metadata
            await supabase.auth.admin.updateUserById(existingUser.id, {
                user_metadata: {
                    user_type: 'provider',
                    first_name: stateData.first_name,
                    surname: stateData.surname,
                    full_name: `${stateData.first_name} ${stateData.surname}`,
                    whatsapp_number: from,
                    registered_via: 'whatsapp',
                    registered_at: existingUser.created_at
                }
            })
        } else {
            // Create new user
            console.log('📝 Creating new auth user...')
            const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                email: stateData.email,
                phone: from,
                email_confirm: true,
                phone_confirm: true,
                user_metadata: {
                    user_type: 'provider',
                    first_name: stateData.first_name,
                    surname: stateData.surname,
                    full_name: `${stateData.first_name} ${stateData.surname}`,
                    whatsapp_number: from,
                    registered_via: 'whatsapp',
                    registered_at: new Date().toISOString()
                }
            })

            if (authError) {
                console.error('❌ Auth error:', authError)
                throw authError
            }

            userId = authData.user.id
            console.log('✅ Auth user created:', userId)
        }

        // ═══════════════════════════════════════════════════════════
        // CREATE BASE PROFILE (CRITICAL - Required for foreign keys)
        // ═══════════════════════════════════════════════════════════
        const { data: existingBaseProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single()

        if (!existingBaseProfile) {
            console.log('📝 Creating base profile...')
            const { error: baseProfileError } = await supabase
                .from('profiles')
                .insert({
                    id: userId,
                    email: stateData.email,
                    phone: from,
                    first_name: stateData.first_name,
                    last_name: stateData.surname,
                    is_client: false,
                    is_provider: true,
                    active_role: 'provider',
                    email_verified: true,
                    is_verified: false,
                    is_active: true,
                    is_suspended: false,
                    is_admin: false,
                    client_onboarding_completed: false,
                    provider_onboarding_completed: false,
                    preferred_contact_method: 'whatsapp',
                    country: 'ZA',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    last_login_at: new Date().toISOString()
                })

            if (baseProfileError) {
                console.error('❌ Base profile error:', {
                    message: baseProfileError.message,
                    code: baseProfileError.code,
                    details: baseProfileError.details,
                    hint: baseProfileError.hint,
                    error: baseProfileError
                })
                throw baseProfileError
            }

            console.log('✅ Base profile created')
        } else {
            console.log('✅ Base profile already exists')

            // Update existing profile to ensure provider role is set
            const { error: updateProfileError } = await supabase
                .from('profiles')
                .update({
                    is_provider: true,
                    active_role: 'provider',
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId)

            if (updateProfileError) {
                console.error('⚠️ Could not update profile:', updateProfileError)
            }
        }

        // ═══════════════════════════════════════════════════════════
        // CREATE PROVIDER PROFILE (extends base profile)
        // ═══════════════════════════════════════════════════════════
        const { data: existingProfile } = await supabase
            .from('provider_profiles')
            .select('*')
            .eq('user_id', userId)
            .single()

        if (!existingProfile) {
            // Create provider profile
            console.log('📝 Creating provider profile...')
            const { data: profileData, error: profileError } = await supabase
                .from('provider_profiles')
                .insert({
                    user_id: userId,
                    category: stateData.category_id,
                    experience_years: stateData.experience_years,
                    portfolio_images: stateData.portfolio_images || [],
                    total_jobs: 0,
                    completed_jobs: 0,
                    success_rate: 0,
                    average_rating: 0,
                    total_reviews: 0,
                    is_available: true,
                    is_verified: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .select()

            if (profileError) {
                console.error('❌ Provider profile error:', {
                    message: profileError.message,
                    code: profileError.code,
                    details: profileError.details,
                    hint: profileError.hint,
                    error: profileError
                })
                throw profileError
            }

            console.log('✅ Provider profile created:', profileData)
        } else {
            console.log('✅ Provider profile already exists')
        }

        // Update state to IDLE
        await updateConversationState(from, 'IDLE', {
            userId: userId,
            userType: 'provider'
        })

        console.log('✅ Provider registration completed!')

        // Send welcome email
        if (!existingUser) {
            try {
                await sendWelcomeEmail(stateData.email, stateData.first_name, 'provider')
            } catch (emailError) {
                console.error('⚠️ Welcome email failed:', emailError)
            }
        }

        // Send success message with menu
        await sendInteractiveButtons(from,
            `🎉 *${existingUser ? 'Welcome back' : 'Registration complete'}!*

Welcome ${stateData.first_name}! You're now registered as a *${stateData.category_name}* provider.

You can now:`,
            [
                { id: 'find_jobs', title: '🔍 Find Jobs' },
                { id: 'my_jobs', title: '📋 My Jobs' },
                { id: 'earnings', title: '💰 Earnings' }
            ]
        )

    } catch (error) {
        console.error('❌ Provider registration failed:', error)
        console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        })

        await sendTextMessage(from,
            `❌ Registration failed. Please try again later or contact support.`)
    }
}

// ═══════════════════════════════════════════════════════════════
// Handle CV Document Upload
// ═══════════════════════════════════════════════════════════════
async function handleProviderCVDocument(from: string, message: any, stateData: any) {
    // TODO: Download and store CV document
    const documentId = message.document?.id || message.image?.id

    console.log('📄 CV document received:', documentId)

    await updateConversationState(from, 'PROVIDER_REG_PORTFOLIO', {
        ...stateData,
        cv_document_id: documentId,
        cv_url: `whatsapp://document/${documentId}` // Placeholder
    })

    await sendTextMessage(from,
        `✅ CV uploaded successfully!

📸 Now, upload photos of your previous work (portfolio).

Send images one by one, or type 'skip' if you don't have any yet.`)
}

// ═══════════════════════════════════════════════════════════════
// Handle Portfolio Image Upload
// ═══════════════════════════════════════════════════════════════
async function handleProviderPortfolioImage(from: string, message: any, stateData: any) {
    const imageId = message.image?.id

    console.log('📸 Portfolio image received:', imageId)

    // Add to portfolio images array
    const portfolioImages = stateData.portfolio_images || []
    portfolioImages.push(`whatsapp://image/${imageId}`) // Placeholder

    await updateConversationState(from, 'PROVIDER_REG_PORTFOLIO', {
        ...stateData,
        portfolio_images: portfolioImages
    })

    await sendTextMessage(from,
        `✅ Photo ${portfolioImages.length} added!

Send more images or type 'done' when finished.`)
}

// ═══════════════════════════════════════════════════════════════
// JOB POSTING FLOW
// ═══════════════════════════════════════════════════════════════
async function startJobPosting(from: string, stateData: any) {
    // Check if user is registered
    const user = await getUserByWhatsApp(from)

    console.log('🔍 startJobPosting - user check:', {
        from,
        userFound: !!user,
        userId: user?.id,
        userType: user?.user_metadata?.user_type
    })

    if (!user) {
        await sendTextMessage(from, `Please register first! Type 'MENU' to get started.`)
        return
    }

    if (user.user_metadata?.user_type !== 'client') {
        await sendTextMessage(from,
            `Only clients can post jobs. Type 'MENU' to see your options.`)
        return
    }

    await updateConversationState(from, 'SELECTING_JOB_CATEGORY', {
        userId: user.id,
        userType: 'client'
    })

    // Show TOP 9 categories + "More categories" option
    await sendInteractiveList(from,
        `📝 *Let's post your job!*

What type of service do you need?`,
        'Choose Category',
        [
            {
                title: '🏠 Popular Services',
                rows: [
                    { id: 'general-handyman', title: 'General Handyman', description: 'Small repairs & fixes' },
                    { id: 'plumbing', title: 'Plumbing', description: 'Taps, pipes, geysers' },
                    { id: 'electrical-power', title: 'Electrical', description: 'Wiring, lighting' },
                    { id: 'painting-decorating', title: 'Painting', description: 'Interior & exterior' },
                    { id: 'cleaning-services', title: 'Cleaning', description: 'Home & office' },
                    { id: 'home-improvements-renovations', title: 'Renovations', description: 'Building work' }
                ]
            },
            {
                title: '🔧 Other Services',
                rows: [
                    { id: 'car-mechanic', title: 'Car Mechanic', description: 'Services & repairs' },
                    { id: 'moving-transport', title: 'Moving', description: 'Bakkie & truck hire' },
                    { id: 'more-categories', title: '➕ More Categories', description: 'See all services' }
                ]
            }
        ]
    )
}

async function showMoreCategories(from: string, stateData: any) {
    await sendInteractiveList(from,
        `📋 *More Categories*

Choose a service category:`,
        'Choose Category',
        [
            {
                title: '🏠 Home Services',
                rows: [
                    { id: 'furniture-assembly-repairs', title: 'Furniture Assembly', description: 'Flat-pack & repairs' },
                    { id: 'appliance-installations', title: 'Appliance Install', description: 'Stoves, gates' }
                ]
            },
            {
                title: '🚗 Automotive',
                rows: [
                    { id: 'panelbeating', title: 'Panelbeating', description: 'Dent repairs' }
                ]
            },
            {
                title: '👥 Personal Services',
                rows: [
                    { id: 'it-tech-support', title: 'IT & Tech', description: 'WiFi, networking' },
                    { id: 'lessons-tutoring', title: 'Tutoring', description: 'School & skills' },
                    { id: 'care-wellness', title: 'Care & Wellness', description: 'Babysitting, care' },
                    { id: 'events-catering', title: 'Events', description: 'Parties & catering' },
                    { id: 'dog-breeding', title: 'Dog Breeding', description: 'Puppies & studs' },
                    { id: 'back-to-main', title: '⬅️ Back', description: 'Main categories' }
                ]
            }
        ]
    )
}

async function handleJobTitle(from: string, title: string, stateData: any) {
    const jobTitle = sanitizeInput(title)

    await updateConversationState(from, 'POSTING_JOB_DESCRIPTION', {
        ...stateData,
        title: jobTitle
    })

    await sendTextMessage(from,
        `Got it! *"${jobTitle}"*

Please describe the problem in detail:`
    )
}

async function handleJobDescription(from: string, description: string, stateData: any) {
    const jobDescription = sanitizeInput(description)

    await updateConversationState(from, 'POSTING_JOB_BUDGET', {
        ...stateData,
        description: jobDescription
    })

    await sendTextMessage(from,
        `Thanks!

💰 What's your budget?

Examples:
• R500
• R500-R800
• 500`
    )
}

async function handleJobBudget(from: string, budget: string, stateData: any) {
    const { min, max } = parseBudget(budget)

    await updateConversationState(from, 'POSTING_JOB_LOCATION', {
        ...stateData,
        budget_min: min,
        budget_max: max
    })

    await sendTextMessage(from,
        `Perfect! Budget: R${min}${max > min ? `-R${max}` : ''}

📍 Where should the provider come?

You can:
• Send your location 📍
• Or type your address`
    )
}

// ═══════════════════════════════════════════════════════════════
// Handle "done" or "skip" for images
// ═══════════════════════════════════════════════════════════════
async function handleJobImages(from: string, text: string, stateData: any) {
    const textLower = text.toLowerCase().trim()

    if (textLower === 'done' || textLower === 'skip') {
        // Finalize and create the job
        await createJobPost(from, stateData)
        return
    }

    await sendTextMessage(from,
        `Type 'done' when finished or 'skip' if you don't want to add photos.`)
}

// ═══════════════════════════════════════════════════════════════
// Create the actual job post in database
// ═══════════════════════════════════════════════════════════════
async function createJobPost(from: string, stateData: any) {
    try {
        const supabase = getSupabaseServer()

        console.log('📝 Creating job post:', stateData)

        // Insert job into database
        const { data: job, error } = await supabase
            .from('jobs')
            .insert({
                client_id: stateData.userId,
                category_id: stateData.category_id,
                title: stateData.title,
                description: stateData.description,
                budget_min: stateData.budget_min,
                budget_max: stateData.budget_max,
                address: stateData.location_text,
                latitude: stateData.latitude,
                longitude: stateData.longitude,
                status: 'active', // ← Changed from 'open' to 'active'
                application_count: 0,
                views_count: 0,
                is_urgent: false,
                is_featured: false,
                posted_at: new Date().toISOString(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single()

        if (error) {
            console.error('❌ Job creation error:', error)
            throw error
        }

        console.log('✅ Job created:', job.id)

        // Reset to IDLE state
        await updateConversationState(from, 'IDLE', {
            userId: stateData.userId,
            userType: 'client'
        })

        // Send success message
        await sendTextMessage(from,
            `✅ *Job posted successfully!*

📋 *${stateData.title}*
💰 Budget: R${stateData.budget_min}${stateData.budget_max > stateData.budget_min ? `-R${stateData.budget_max}` : ''}
📍 ${stateData.location_text || 'Location provided'}

Service providers in your area will see your job and send quotes. You'll be notified when quotes come in!`)

        // Wait a moment, then show menu
        await new Promise(resolve => setTimeout(resolve, 2000))

        await sendInteractiveButtons(from,
            `What would you like to do next?`,
            [
                { id: 'post_job', title: '📝 Post Another Job' },
                { id: 'my_jobs', title: '📋 My Jobs' },
                { id: 'history', title: '📊 History' }
            ]
        )

    } catch (error) {
        console.error('❌ Failed to create job:', error)
        await sendTextMessage(from,
            `❌ Sorry, something went wrong. Please try again or type 'MENU'.`)
    }
}

// ═══════════════════════════════════════════════════════════════
// HANDLE IMAGE MESSAGES
// ═══════════════════════════════════════════════════════════════
async function handleImageMessage(
    from: string,
    message: any,
    currentState: ConversationState,
    stateData: any
) {
    if (currentState === 'POSTING_JOB_IMAGES') {
        // Handle job photos
        await sendTextMessage(from,
            `✅ Photo added! Send another or type 'done'`)
    } else if (currentState === 'PROVIDER_REG_PORTFOLIO') {
        // Handle portfolio images
        await handleProviderPortfolioImage(from, message, stateData)
    } else if (currentState === 'PROVIDER_REG_CV') {
        // Handle CV as image
        await handleProviderCVDocument(from, message, stateData)
    }
}

// ═══════════════════════════════════════════════════════════════
// HANDLE DOCUMENT MESSAGES
// ═══════════════════════════════════════════════════════════════
async function handleDocumentMessage(
    from: string,
    message: any,
    currentState: ConversationState,
    stateData: any
) {
    if (currentState === 'PROVIDER_REG_CV') {
        await handleProviderCVDocument(from, message, stateData)
    }
}

// ═══════════════════════════════════════════════════════════════
// Handle text location input (when user types address instead of sending GPS)
// ═══════════════════════════════════════════════════════════════
async function handleJobLocation(from: string, location: string, stateData: any) {
    const locationText = sanitizeInput(location)

    await updateConversationState(from, 'POSTING_JOB_IMAGES', {
        ...stateData,
        location_text: locationText
    })

    await sendTextMessage(from,
        `Great! Location saved: ${locationText}

📸 Any photos to help providers understand the job better?

Send images or type 'skip' to continue`)
}

// ═══════════════════════════════════════════════════════════════
// HANDLE LOCATION MESSAGES
// ═══════════════════════════════════════════════════════════════
async function handleLocationMessage(
    from: string,
    message: any,
    currentState: ConversationState,
    stateData: any
) {
    const latitude = message.location.latitude
    const longitude = message.location.longitude

    // Handle job posting location
    if (currentState === 'POSTING_JOB_LOCATION') {
        await updateConversationState(from, 'POSTING_JOB_IMAGES', {
            ...stateData,
            latitude,
            longitude
        })

        await sendTextMessage(from,
            `Great! Location saved.

📸 Any photos to help providers?

Send images or type 'skip'`)
        return
    }

    // Handle provider registration location
    if (currentState === 'PROVIDER_REG_ADDRESS') {
        // Generate verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()

        try {
            // Send verification email
            await sendVerificationEmail(stateData.email, verificationCode, stateData.first_name)

            await updateConversationState(from, 'PROVIDER_REG_VERIFICATION', {
                ...stateData,
                latitude,
                longitude,
                address: `Location: ${latitude}, ${longitude}`,
                verification_code: verificationCode,
                verification_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
            })

            await sendTextMessage(from,
                `Perfect! Location saved.

📧 Verification code sent to ${stateData.email}

Enter the 6-digit code (valid for 10 minutes):`)

        } catch (error) {
            console.error('❌ Email error:', error)
            await sendTextMessage(from,
                `❌ Failed to send verification email. Please try again later.`)
        }
        return
    }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════
async function getUserByWhatsApp(phone: string) {
    const supabase = getSupabaseServer()

    // Get user from Supabase Auth
    const { data: { users }, error } = await supabase.auth.admin.listUsers()

    if (error) {
        console.error('Error fetching users:', error)
        return null
    }

    // Find user by phone number
    const user = users?.find(u => u.phone === phone)

    console.log('👤 getUserByWhatsApp result:', {
        phone,
        found: !!user,
        userId: user?.id,
        userType: user?.user_metadata?.user_type
    })

    return user || null
}

async function logMessage(from: string, text: string, type: string) {
    try {
        const supabase = getSupabaseServer()
        await supabase.from('whatsapp_messages').insert({
            whatsapp_number: from,
            message_text: text,
            message_type: type,
            direction: 'incoming',
            created_at: new Date().toISOString()
        })
    } catch (error) {
        // Don't fail the whole flow if logging fails
        console.error('⚠️ Failed to log message:', error)
    }
}

async function handleHelp(from: string) {
    await sendTextMessage(from,
        `🆘 *JUST WORK Help*

*Available commands:*
• MENU - Show main menu
• HELP - This message

*Need support?*
WhatsApp: +27 73 089 9949
Email: support@justwork.co.za
Website: justwork.co.za/help`
    )
}

async function handleIdleState(from: string, text: string) {
    const textLower = text.toLowerCase().trim()

    if (textLower.includes('post') || textLower.includes('job')) {
        const user = await getUserByWhatsApp(from)
        await startJobPosting(from, { userId: user?.id })
    } else {
        await sendTextMessage(from,
            `Type 'MENU' to see options or 'HELP' for assistance.`)
    }
}

async function showMyJobs(from: string, stateData: any) {
    // TODO: Implement
    await sendTextMessage(from, `📋 My Jobs feature coming soon!`)
}

async function showHistory(from: string, stateData: any) {
    // TODO: Implement
    await sendTextMessage(from, `📊 History feature coming soon!`)
}

async function findJobs(from: string, stateData: any) {
    // TODO: Implement
    await sendTextMessage(from, `🔍 Find Jobs feature coming soon!`)
}

async function showEarnings(from: string, stateData: any) {
    // TODO: Implement
    await sendTextMessage(from, `💰 Earnings feature coming soon!`)
}