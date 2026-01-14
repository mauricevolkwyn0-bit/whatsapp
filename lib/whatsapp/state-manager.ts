// lib/whatsapp/state-manager.ts
import { getSupabaseServer } from '@/lib/supabase/server'

// ═══════════════════════════════════════════════════════════════
// CONVERSATION STATES - UPDATED FOR NEW REGISTRATION FLOW
// ═══════════════════════════════════════════════════════════════
export type ConversationState =
    // General states
    | 'IDLE'
    | 'CHOOSING_USER_TYPE'
    
    // ✅ NEW REGISTRATION FLOW
    | 'APPLICANT_REG_CONSENT'             // Step 0: Consent to capture personal information
    | 'APPLICANT_REG_ID_NUMBER'           // Step 1: Enter ID number
    | 'APPLICANT_REG_ID_UPLOAD'           // Step 2: Upload ID document
    | 'APPLICANT_REG_SELFIE'              // Step 3: Upload selfie
    | 'APPLICANT_REG_EMAIL'               // Step 4: Enter email
    | 'APPLICANT_REG_LOCATION'            // Step 5: Enter location
    | 'APPLICANT_REG_PROOF_OF_RESIDENCE_UPLOAD' // Step 6: Upload proof of residence
    | 'APPLICANT_REG_CV_UPLOAD'           // Step 7: Upload CV/Resume
    | 'APPLICANT_REG_SELECTING_CATEGORY'  // Step 8: Select category
    | 'APPLICANT_REG_SELECTING_TITLE'     // Step 9: Select job title
    | 'UPLOADING_REQUIRED_DOCS'           // Step 10: Upload required documents
    
    // OLD STATES (kept for backwards compatibility)
    | 'APPLICANT_REG_ADDRESS'
    | 'APPLICANT_REG_SELECTING_LEVEL'
    | 'APPLICANT_REG_UPLOADING_DOCS'
    | 'UPLOADING_GENERAL_WORKER_DOCS'
    | 'UPLOADING_SEMI_SKILLED_DOCS'
    | 'UPLOADING_SKILLED_WORKER_DOCS'
    | 'UPLOADING_PROFESSIONAL_DOCS'
    
    // Client states
    | 'CLIENT_REG_COMPANY_NAME'
    | 'CLIENT_REG_INDUSTRY'
    | 'CLIENT_REG_EMAIL'
    | 'CLIENT_REG_PHYSICAL_ADDRESS'
    | 'CLIENT_REG_UPLOAD_DOCS'
    | 'CLIENT_POSTING_JOB_TITLE'
    | 'CLIENT_POSTING_JOB_DESCRIPTION'
    | 'CLIENT_POSTING_JOB_LOCATION'
    | 'CLIENT_POSTING_JOB_SALARY'
    | 'CLIENT_POSTING_JOB_REQUIREMENTS'
    | 'CLIENT_VIEWING_APPLICATIONS'
    | 'CLIENT_REVIEWING_APPLICATION'
    
    // Provider states (for future use)
    | 'PROVIDER_REG_BUSINESS_NAME'
    | 'PROVIDER_REG_SERVICE_TYPE'
    | 'PROVIDER_REG_EMAIL'
    | 'PROVIDER_REG_PHYSICAL_ADDRESS'
    | 'PROVIDER_REG_UPLOAD_DOCS'
    | 'PROVIDER_BROWSING_JOBS'
    | 'PROVIDER_APPLYING_FOR_JOB'
    | 'PROVIDER_VIEWING_APPLICATIONS'
    
    // Job application states
    | 'BROWSING_JOBS'
    | 'VIEWING_JOB_DETAILS'
    | 'APPLYING_FOR_JOB'
    | 'UPLOADING_APPLICATION_DOCS'
    | 'VIEWING_MY_APPLICATIONS'
    | 'VIEWING_APPLICATION_STATUS'
    
    // Interview states
    | 'SCHEDULING_INTERVIEW'
    | 'CONFIRMING_INTERVIEW'
    | 'RESCHEDULING_INTERVIEW'
    | 'VIEWING_UPCOMING_INTERVIEWS'
    
    // Payment states
    | 'PROCESSING_PAYMENT'
    | 'CONFIRMING_PAYMENT'
    | 'VIEWING_PAYMENT_HISTORY'
    | 'WITHDRAWAL_AMOUNT'
    | 'WITHDRAWAL_BANK_DETAILS'

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
            .single()

        if (error) {
            if (error.code === 'PGRST116') {
                // No state found - return null
                return null
            }
            throw error
        }

        return data
    } catch (error) {
        console.error('Error getting conversation state:', error)
        return null
    }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE CONVERSATION STATE
// ═══════════════════════════════════════════════════════════════
export async function updateConversationState(
    whatsappNumber: string,
    newState: ConversationState,
    data: any = {}
) {
    try {
        const supabase = getSupabaseServer()

        // Check if state exists
        const existingState = await getConversationState(whatsappNumber)

        if (existingState) {
            // Update existing state
            const { error } = await supabase
                .from('whatsapp_conversation_states')
                .update({
                    current_state: newState,
                    data: data,
                    updated_at: new Date().toISOString()
                })
                .eq('whatsapp_number', whatsappNumber)

            if (error) throw error
        } else {
            // Create new state
            const { error } = await supabase
                .from('whatsapp_conversation_states')
                .insert({
                    whatsapp_number: whatsappNumber,
                    current_state: newState,
                    data: data
                })

            if (error) throw error
        }

        console.log(`✅ State updated: ${whatsappNumber} → ${newState}`)
    } catch (error) {
        console.error('Error updating conversation state:', error)
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

        if (error) throw error

        console.log(`✅ State cleared: ${whatsappNumber}`)
    } catch (error) {
        console.error('Error clearing conversation state:', error)
        throw error
    }
}

// ═══════════════════════════════════════════════════════════════
// RESET TO IDLE STATE
// ═══════════════════════════════════════════════════════════════
export async function resetToIdle(whatsappNumber: string) {
    await updateConversationState(whatsappNumber, 'IDLE', {})
}