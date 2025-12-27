// lib/whatsapp/api.ts
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!
const WHATSAPP_API_URL = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`

export interface WhatsAppMessage {
  to: string
  type: 'text' | 'interactive' | 'image' | 'document' | 'location'
  text?: { body: string }
  interactive?: any
  image?: { link: string; caption?: string }
  document?: { link: string; filename?: string; caption?: string }
  location?: { latitude: number; longitude: number; name?: string; address?: string }
}

// ═══════════════════════════════════════════════════════════════
// MAIN SEND FUNCTION
// ═══════════════════════════════════════════════════════════════
export async function sendWhatsAppMessage(message: WhatsAppMessage) {
  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        ...message,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('WhatsApp API error:', error)
      throw new Error(`WhatsApp API error: ${error.error?.message}`)
    }

    const data = await response.json()
    console.log('✅ Message sent successfully:', data.messages?.[0]?.id)
    return data
  } catch (error) {
    console.error('Failed to send WhatsApp message:', error)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════
// SEND TEXT MESSAGE
// ═══════════════════════════════════════════════════════════════
export async function sendTextMessage(to: string, text: string) {
  return sendWhatsAppMessage({
    to,
    type: 'text',
    text: { body: text },
  })
}

// ═══════════════════════════════════════════════════════════════
// SEND INTERACTIVE BUTTONS (Max 3 buttons)
// ═══════════════════════════════════════════════════════════════
export async function sendInteractiveButtons(
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  headerText?: string,
  footerText?: string
) {
  if (buttons.length > 3) {
    throw new Error('WhatsApp supports maximum 3 buttons')
  }

  if (buttons.some(btn => btn.title.length > 20)) {
    throw new Error('Button title must be 20 characters or less')
  }

  const interactive: any = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: buttons.map(btn => ({
        type: 'reply',
        reply: {
          id: btn.id,
          title: btn.title,
        },
      })),
    },
  }

  if (headerText) {
    interactive.header = {
      type: 'text',
      text: headerText,
    }
  }

  if (footerText) {
    interactive.footer = {
      text: footerText,
    }
  }

  return sendWhatsAppMessage({
    to,
    type: 'interactive',
    interactive,
  })
}

// ═══════════════════════════════════════════════════════════════
// SEND INTERACTIVE LIST (For more than 3 options)
// ═══════════════════════════════════════════════════════════════
export async function sendInteractiveList(
  to: string,
  bodyText: string,
  buttonText: string,
  sections: Array<{
    title: string
    rows: Array<{ id: string; title: string; description?: string }>
  }>,
  headerText?: string,
  footerText?: string
) {
  // Validation
  if (buttonText.length > 20) {
    throw new Error('Button text must be 20 characters or less')
  }

  const totalRows = sections.reduce((sum, section) => sum + section.rows.length, 0)
  if (totalRows > 10) {
    throw new Error('WhatsApp supports maximum 10 list items')
  }

  sections.forEach(section => {
    section.rows.forEach(row => {
      if (row.title.length > 24) {
        throw new Error('List item title must be 24 characters or less')
      }
      if (row.description && row.description.length > 72) {
        throw new Error('List item description must be 72 characters or less')
      }
    })
  })

  const interactive: any = {
    type: 'list',
    body: { text: bodyText },
    action: {
      button: buttonText,
      sections: sections,
    },
  }

  if (headerText) {
    interactive.header = {
      type: 'text',
      text: headerText,
    }
  }

  if (footerText) {
    interactive.footer = {
      text: footerText,
    }
  }

  return sendWhatsAppMessage({
    to,
    type: 'interactive',
    interactive,
  })
}

// ═══════════════════════════════════════════════════════════════
// SEND IMAGE
// ═══════════════════════════════════════════════════════════════
export async function sendImage(
  to: string,
  imageUrl: string,
  caption?: string
) {
  return sendWhatsAppMessage({
    to,
    type: 'image',
    image: {
      link: imageUrl,
      caption: caption,
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// SEND DOCUMENT
// ═══════════════════════════════════════════════════════════════
export async function sendDocument(
  to: string,
  documentUrl: string,
  filename?: string,
  caption?: string
) {
  return sendWhatsAppMessage({
    to,
    type: 'document',
    document: {
      link: documentUrl,
      filename: filename,
      caption: caption,
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// SEND LOCATION
// ═══════════════════════════════════════════════════════════════
export async function sendLocation(
  to: string,
  latitude: number,
  longitude: number,
  name?: string,
  address?: string
) {
  return sendWhatsAppMessage({
    to,
    type: 'location',
    location: {
      latitude,
      longitude,
      name,
      address,
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// DOWNLOAD MEDIA FROM WHATSAPP
// ═══════════════════════════════════════════════════════════════
export async function downloadWhatsAppMedia(mediaId: string): Promise<{
  url: string
  mimeType: string
  sha256: string
  fileSize: number
}> {
  try {
    // Step 1: Get media URL
    const mediaInfoResponse = await fetch(
      `https://graph.facebook.com/v22.0/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        },
      }
    )

    if (!mediaInfoResponse.ok) {
      throw new Error('Failed to get media info')
    }

    const mediaInfo = await mediaInfoResponse.json()

    // Step 2: Download the actual media
    const mediaResponse = await fetch(mediaInfo.url, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      },
    })

    if (!mediaResponse.ok) {
      throw new Error('Failed to download media')
    }

    return {
      url: mediaInfo.url,
      mimeType: mediaInfo.mime_type,
      sha256: mediaInfo.sha256,
      fileSize: mediaInfo.file_size,
    }
  } catch (error) {
    console.error('Failed to download WhatsApp media:', error)
    throw error
  }
}

// ═══════════════════════════════════════════════════════════════
// MARK MESSAGE AS READ
// ═══════════════════════════════════════════════════════════════
export async function markMessageAsRead(messageId: string) {
  try {
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Failed to mark message as read:', error)
    }

    return response.json()
  } catch (error) {
    console.error('Error marking message as read:', error)
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Format Phone Number
// ═══════════════════════════════════════════════════════════════
export function formatPhoneNumber(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '')
  
  // If it starts with 0, replace with 27 (South Africa)
  if (cleaned.startsWith('0')) {
    cleaned = '27' + cleaned.substring(1)
  }
  
  // If it doesn't start with country code, add 27
  if (!cleaned.startsWith('27')) {
    cleaned = '27' + cleaned
  }
  
  return cleaned
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Validate WhatsApp Number
// ═══════════════════════════════════════════════════════════════
export function isValidWhatsAppNumber(phone: string): boolean {
  const formatted = formatPhoneNumber(phone)
  // South African numbers: 27 + 9 digits
  return /^27\d{9}$/.test(formatted)
}