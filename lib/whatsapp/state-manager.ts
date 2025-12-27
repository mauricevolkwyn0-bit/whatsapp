// lib/whatsapp/state-manager.ts
import { getSupabaseServer } from '@/lib/supabase/server'

// ═══════════════════════════════════════════════════════════════
// CONVERSATION STATES
// ═══════════════════════════════════════════════════════════════
export type ConversationState =
  // General
  | 'IDLE'
  | 'CHOOSING_USER_TYPE'
  
  // Client Registration
  | 'CLIENT_REG_NAME'
  | 'CLIENT_REG_SURNAME'
  | 'CLIENT_REG_EMAIL'
  | 'CLIENT_REG_VERIFICATION'
  
  // Provider Registration
  | 'PROVIDER_REG_NAME'
  | 'PROVIDER_REG_SURNAME'
  | 'PROVIDER_REG_EMAIL'
  | 'PROVIDER_REG_CATEGORY'
  | 'PROVIDER_REG_EXPERIENCE'
  | 'PROVIDER_REG_CV'
  | 'PROVIDER_REG_PORTFOLIO'
  | 'PROVIDER_REG_ADDRESS'
  | 'PROVIDER_REG_VERIFICATION'
  
  // Job Posting
  | 'POSTING_JOB_TITLE'
  | 'POSTING_JOB_DESCRIPTION'
  | 'POSTING_JOB_BUDGET'
  | 'POSTING_JOB_LOCATION'
  | 'POSTING_JOB_IMAGES'
  | 'CONFIRMING_JOB'
  
  // Job Application
  | 'APPLYING_PRICE'
  | 'APPLYING_AVAILABILITY'
  | 'APPLYING_MESSAGE'
  
  // Reviews
  | 'REVIEWING_APPLICATIONS'
  | 'RATING_PROVIDER'
  | 'RATING_CLIENT'
  | 'REVIEW_COMMENT'
  
  // Other
  | 'PENDING_JOB_POST'
  | 'PENDING_FIND_JOBS'
  | 'VIEWING_JOB_DETAILS'
  | 'WITHDRAWAL_AMOUNT'
  | 'WITHDRAWAL_BANK_DETAILS'

// ═══════════════════════════════════════════════════════════════
// STATE DATA INTERFACE
// ═══════════════════════════════════════════════════════════════
export interface StateData {
  // User info
  userId?: string
  userType?: 'client' | 'provider'
  
  // Registration
  user_type?: 'client' | 'provider'
  first_name?: string
  surname?: string
  email?: string
  verification_code?: string
  category?: string
  experience?: string
  cv_url?: string
  portfolio_urls?: string[]
  address?: string
  
  // Job posting
  title?: string
  description?: string
  budget_min?: number
  budget_max?: number
  latitude?: number
  longitude?: number
  location_address?: string
  images?: string[]
  job_id?: string
  
  // Job application
  application_id?: string
  proposed_amount?: number
  availability?: string
  cover_letter?: string
  
  // Reviews
  assignment_id?: string
  rating?: number
  comment?: string
  
  // Other
  [key: string]: any
}

// ═══════════════════════════════════════════════════════════════
// GET CONVERSATION STATE
// ═══════════════════════════════════════════════════════════════
export async function getConversationState(whatsappNumber: string) {
  try {
    const supabase = getSupabaseServer() // ✅ Create client here
    
    const { data, error } = await supabase
      .from('whatsapp_conversation_states')
      .select('*')
      .eq('whatsapp_number', whatsappNumber)
      .maybeSingle()

    if (error) {
      console.error('Error fetching conversation state:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('Error in getConversationState:', error)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE CONVERSATION STATE
// ═══════════════════════════════════════════════════════════════
export async function updateConversationState(
  whatsappNumber: string,
  newState: ConversationState,
  data: StateData = {}
) {
  try {
    const supabase = getSupabaseServer() // ✅ Create client here
    
    const { error } = await supabase
      .from('whatsapp_conversation_states')
      .upsert(
        {
          whatsapp_number: whatsappNumber,
          current_state: newState,
          data: data,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'whatsapp_number',
        }
      )

    if (error) {
      console.error('Error updating conversation state:', error)
      throw error
    }

    console.log(`✅ State updated: ${whatsappNumber} → ${newState}`)
  } catch (error) {
    console.error('Error in updateConversationState:', error)
    throw error
  }
}


// ═══════════════════════════════════════════════════════════════
// UPDATE STATE DATA (Keep current state, update data only)
// ═══════════════════════════════════════════════════════════════
export async function updateStateData(
  whatsappNumber: string,
  newData: StateData
) {
  try {
    const state = await getConversationState(whatsappNumber)

    if (!state) {
      console.warn(`No state found for ${whatsappNumber}, creating new state`)
      await updateConversationState(whatsappNumber, 'IDLE', newData)
      return
    }

    const currentState = (state.current_state as ConversationState) || 'IDLE'
    const currentData = (state.data || {}) as StateData

    await updateConversationState(
      whatsappNumber,
      currentState,
      { ...currentData, ...newData }
    )
  } catch (error) {
    console.error('Error in updateStateData:', error)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════
// CLEAR CONVERSATION STATE
// ═══════════════════════════════════════════════════════════════
export async function clearConversationState(whatsappNumber: string) {
  try {
    const supabase = getSupabaseServer() // ✅ Create client here
    
    const { error } = await supabase
      .from('whatsapp_conversation_states')
      .delete()
      .eq('whatsapp_number', whatsappNumber)

    if (error) {
      console.error('Error clearing conversation state:', error)
      throw error
    }

    console.log(`✅ State cleared for ${whatsappNumber}`)
  } catch (error) {
    console.error('Error in clearConversationState:', error)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════
// RESET TO IDLE STATE
// ═══════════════════════════════════════════════════════════════
export async function resetToIdle(
  whatsappNumber: string,
  preserveData?: Partial<StateData>
) {
  try {
    await updateConversationState(
      whatsappNumber,
      'IDLE',
      preserveData || {}
    )
    console.log(`✅ State reset to IDLE for ${whatsappNumber}`)
  } catch (error) {
    console.error('Error in resetToIdle:', error)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════
// GET STATE DATA (Helper to get just the data object)
// ═══════════════════════════════════════════════════════════════
export async function getStateData(whatsappNumber: string): Promise<StateData> {
  const state = await getConversationState(whatsappNumber)
  return (state?.data || {}) as StateData
}

// ═══════════════════════════════════════════════════════════════
// CHECK IF STATE EXISTS
// ═══════════════════════════════════════════════════════════════
export async function hasConversationState(whatsappNumber: string): Promise<boolean> {
  const state = await getConversationState(whatsappNumber)
  return state !== null
}

// ═══════════════════════════════════════════════════════════════
// GET CURRENT STATE (Helper to get just the state string)
// ═══════════════════════════════════════════════════════════════
export async function getCurrentState(whatsappNumber: string): Promise<ConversationState> {
  const state = await getConversationState(whatsappNumber)
  return (state?.current_state as ConversationState) || 'IDLE'
}

// ═══════════════════════════════════════════════════════════════
// APPEND TO ARRAY IN STATE DATA
// ═══════════════════════════════════════════════════════════════
export async function appendToStateArray(
  whatsappNumber: string,
  arrayKey: string,
  value: any
) {
  const stateData = await getStateData(whatsappNumber)
  const currentArray = (stateData[arrayKey] || []) as any[]
  
  await updateStateData(whatsappNumber, {
    [arrayKey]: [...currentArray, value]
  })
}

// ═══════════════════════════════════════════════════════════════
// REMOVE FROM ARRAY IN STATE DATA
// ═══════════════════════════════════════════════════════════════
export async function removeFromStateArray(
  whatsappNumber: string,
  arrayKey: string,
  index: number
) {
  const stateData = await getStateData(whatsappNumber)
  const currentArray = (stateData[arrayKey] || []) as any[]
  
  const newArray = currentArray.filter((_, i) => i !== index)
  
  await updateStateData(whatsappNumber, {
    [arrayKey]: newArray
  })
}

// ═══════════════════════════════════════════════════════════════
// INCREMENT NUMBER IN STATE DATA
// ═══════════════════════════════════════════════════════════════
export async function incrementStateValue(
  whatsappNumber: string,
  key: string,
  amount: number = 1
) {
  const stateData = await getStateData(whatsappNumber)
  const currentValue = (stateData[key] || 0) as number
  
  await updateStateData(whatsappNumber, {
    [key]: currentValue + amount
  })
}

// ═══════════════════════════════════════════════════════════════
// STATE VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════
export function isRegistrationState(state: ConversationState): boolean {
  return state.includes('REG_')
}

export function isJobPostingState(state: ConversationState): boolean {
  return state.includes('POSTING_JOB_')
}

export function isApplicationState(state: ConversationState): boolean {
  return state.includes('APPLYING_')
}

export function isReviewState(state: ConversationState): boolean {
  return state.includes('RATING_') || state.includes('REVIEW_')
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP OLD STATES (Run periodically)
// ═══════════════════════════════════════════════════════════════
export async function cleanupOldStates(daysOld: number = 7) {
  try {
    const supabase = getSupabaseServer() // ✅ Create client here
    
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysOld)

    const { error } = await supabase
      .from('whatsapp_conversation_states')
      .delete()
      .lt('last_message_at', cutoffDate.toISOString())

    if (error) {
      console.error('Error cleaning up old states:', error)
      throw error
    }

    console.log(`✅ Cleaned up states older than ${daysOld} days`)
  } catch (error) {
    console.error('Error in cleanupOldStates:', error)
    throw error
  }
}