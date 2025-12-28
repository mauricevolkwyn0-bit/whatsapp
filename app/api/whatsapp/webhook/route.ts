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

    console.log(`Button clicked: ${buttonId}`)

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

    // Check if client profile exists
    const { data: existingProfile } = await supabase
      .from('client_profiles')
      .select('*')
      .eq('user_id', userId)
      .single()

    if (!existingProfile) {
      // Create client profile
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
        console.error('❌ Profile error:', {
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

What's your first name?`
    )
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

  // Show category selection list
  await sendInteractiveList(from,
    `📝 *Let's post your job!*

What type of service do you need?`,
    'Choose Category',
    [
      {
        title: '🏠 Home & Property',
        rows: [
          { id: 'general-handyman', title: 'General Handyman', description: 'Small repairs & fixes' },
          { id: 'plumbing', title: 'Plumbing', description: 'Taps, pipes, geysers' },
          { id: 'electrical-power', title: 'Electrical & Power', description: 'Wiring, lighting, plugs' },
          { id: 'painting-decorating', title: 'Painting', description: 'Interior & exterior' },
          { id: 'cleaning-services', title: 'Cleaning', description: 'Home & office cleaning' },
          { id: 'home-improvements-renovations', title: 'Renovations', description: 'Building projects' }
        ]
      },
      {
        title: '🔧 Installation & Assembly',
        rows: [
          { id: 'furniture-assembly-repairs', title: 'Furniture Assembly', description: 'Flat-pack & repairs' },
          { id: 'appliance-installations', title: 'Appliance Install', description: 'Stoves, gates, motors' }
        ]
      },
      {
        title: '🚗 Automotive',
        rows: [
          { id: 'car-mechanic', title: 'Car Mechanic', description: 'Services & repairs' },
          { id: 'panelbeating', title: 'Panelbeating', description: 'Dent repairs & bodywork' }
        ]
      },
      {
        title: '👥 Personal & Professional',
        rows: [
          { id: 'moving-transport', title: 'Moving & Transport', description: 'Bakkie & truck hire' },
          { id: 'it-tech-support', title: 'IT & Tech Support', description: 'WiFi, networking, laptops' },
          { id: 'lessons-tutoring', title: 'Lessons & Tutoring', description: 'School & skills training' },
          { id: 'care-wellness', title: 'Care & Wellness', description: 'Babysitting, elderly care' },
          { id: 'events-catering', title: 'Events & Catering', description: 'Parties & special occasions' },
          { id: 'dog-breeding', title: 'Dog Breeding', description: 'Puppies & stud services' }
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
        // TODO: Download and store image
        await sendTextMessage(from,
            `✅ Photo added! Send another or type 'done'`)
    }
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
    if (currentState === 'POSTING_JOB_LOCATION') {
        const latitude = message.location.latitude
        const longitude = message.location.longitude

        await updateConversationState(from, 'POSTING_JOB_IMAGES', {
            ...stateData,
            latitude,
            longitude
        })

        await sendTextMessage(from,
            `Great! Location saved.

📸 Any photos to help providers?

Send images or type 'skip'`
        )
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
    const supabase = getSupabaseServer()
    await supabase.from('whatsapp_messages').insert({
        whatsapp_number: from,
        message_text: text,
        message_type: type,
        direction: 'incoming',
        created_at: new Date().toISOString()
    })
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