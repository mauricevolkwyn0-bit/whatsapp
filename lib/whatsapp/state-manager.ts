// lib/whatsapp/state-manager.ts
import { getSupabaseServer } from '@/lib/supabase/server'

// ═══════════════════════════════════════════════════════════════
// CONVERSATION STATES
// ═══════════════════════════════════════════════════════════════
export type ConversationState =
  // General
  | 'IDLE'
  | 'CHOOSING_USER_TYPE'
  
  // Mining Applicant Registration
  | 'APPLICANT_REG_ID_NUMBER'
  | 'APPLICANT_REG_ID_UPLOAD'
  | 'APPLICANT_REG_EMAIL'
  | 'APPLICANT_REG_ADDRESS'
  | 'APPLICANT_REG_SELECTING_LEVEL'
  | 'APPLICANT_REG_UPLOADING_DOCS'
  | 'APPLICANT_REG_COMPLETE'
  
  // Document Uploads by Level
  | 'UPLOADING_GENERAL_WORKER_DOCS'
  | 'UPLOADING_SEMI_SKILLED_DOCS'
  | 'UPLOADING_SKILLED_WORKER_DOCS'
  | 'UPLOADING_PROFESSIONAL_DOCS'
  
  // Profile Management
  | 'UPDATING_PROFILE'
  | 'UPDATING_CONTACT'
  | 'UPDATING_DOCUMENTS'
  | 'UPDATING_QUALIFICATIONS'
  
  // Job Notifications & Actions
  | 'VIEWING_JOB_DETAILS'
  | 'VIEWING_INTERVIEW_DETAILS'
  | 'CONFIRMING_INTERVIEW'
  | 'VIEWING_JOB_OFFER'
  | 'ACCEPTING_JOB_OFFER'
  
  // Legacy states (keep for backward compatibility)
  | 'CLIENT_REG_NAME'
  | 'CLIENT_REG_SURNAME'
  | 'CLIENT_REG_EMAIL'
  | 'CLIENT_REG_VERIFICATION'
  | 'SELECTING_JOB_CATEGORY'
  | 'PROVIDER_REG_NAME'
  | 'PROVIDER_REG_SURNAME'
  | 'PROVIDER_REG_EMAIL'
  | 'PROVIDER_REG_CATEGORY'
  | 'PROVIDER_REG_EXPERIENCE'
  | 'PROVIDER_REG_CV'
  | 'PROVIDER_REG_PORTFOLIO'
  | 'PROVIDER_REG_ADDRESS'
  | 'PROVIDER_REG_VERIFICATION'
  | 'POSTING_JOB_TITLE'
  | 'POSTING_JOB_DESCRIPTION'
  | 'POSTING_JOB_BUDGET'
  | 'POSTING_JOB_LOCATION'
  | 'POSTING_JOB_IMAGES'
  | 'CONFIRMING_JOB'
  | 'APPLYING_PRICE'
  | 'APPLYING_AVAILABILITY'
  | 'APPLYING_MESSAGE'
  | 'REVIEWING_APPLICATIONS'
  | 'RATING_PROVIDER'
  | 'RATING_CLIENT'
  | 'REVIEW_COMMENT'
  | 'PENDING_JOB_POST'
  | 'PENDING_FIND_JOBS'
  | 'WITHDRAWAL_AMOUNT'
  | 'WITHDRAWAL_BANK_DETAILS'

// ═══════════════════════════════════════════════════════════════
// STATE DATA INTERFACE
// ═══════════════════════════════════════════════════════════════
export interface StateData {
  // User info
  userId?: string
  userType?: 'client' | 'provider' | 'applicant'
  
  // Mining-specific fields
  id_number?: string
  id_document_url?: string
  home_affairs_verified?: boolean
  physical_address?: string
  experience_level?: 'general_worker' | 'semi_skilled' | 'skilled_worker' | 'professional'
  uploaded_documents?: Record<string, string> // document_type -> url
  pending_documents?: string[] // List of documents still needed
  applicant_id?: string
  date_of_birth?: string
  age?: number
  gender?: string
  citizenship?: string
  last_name?: string
  
  // Job notification fields
  job_posting_id?: string
  interview_id?: string
  offer_id?: string
  
  // Legacy/Original fields
  user_type?: 'client' | 'provider'
  first_name?: string
  surname?: string
  email?: string
  verification_code?: string
  verification_expires_at?: string
  category?: string
  category_id?: string
  category_name?: string
  experience?: string
  experience_years?: number
  cv_url?: string
  cv_document_id?: string
  portfolio_urls?: string[]
  portfolio_images?: string[]
  address?: string
  
  // Job posting
  title?: string
  description?: string
  budget_min?: number
  budget_max?: number
  latitude?: number
  longitude?: number
  location_text?: string
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
    const supabase = getSupabaseServer()
    
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
    const supabase = getSupabaseServer()
    
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
    const supabase = getSupabaseServer()
    
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

export function isMiningApplicantState(state: ConversationState): boolean {
  return state.includes('APPLICANT_REG_') || state.includes('UPLOADING_')
}

export function isProfileUpdateState(state: ConversationState): boolean {
  return state.includes('UPDATING_')
}

export function isJobNotificationState(state: ConversationState): boolean {
  return state.includes('VIEWING_') || state.includes('CONFIRMING_') || state.includes('ACCEPTING_')
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP OLD STATES (Run periodically)
// ═══════════════════════════════════════════════════════════════
export async function cleanupOldStates(daysOld: number = 7) {
  try {
    const supabase = getSupabaseServer()
    
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