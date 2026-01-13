// lib/utils/validation.ts

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email.toLowerCase())
}

export function sanitizeInput(input: string): string {
  return input.trim().replace(/[<>]/g, '')
}

export function parseBudget(budgetText: string): { min: number; max: number } {
  const cleaned = budgetText.replace(/[^\d-]/g, '')
  const parts = cleaned.split('-')
  
  const min = parseInt(parts[0])
  const max = parts[1] ? parseInt(parts[1]) : min
  
  return { min, max }
}

// ═══════════════════════════════════════════════════════════════
// MINING-SPECIFIC VALIDATORS
// ═══════════════════════════════════════════════════════════════

/**
 * Validate South African ID Number
 * Format: YYMMDD SSSS C A Z
 * - YYMMDD: Date of birth
 * - SSSS: Sequence number (0000-4999 female, 5000-9999 male)
 * - C: Citizenship (0=SA, 1=foreign)
 * - A: Usually 8 or 9
 * - Z: Checksum digit
 */
export function isValidSAIDNumber(idNumber: string): boolean {
  // Remove spaces and check length
  const cleaned = idNumber.replace(/\s/g, '')
  if (cleaned.length !== 13 || !/^\d+$/.test(cleaned)) {
    return false
  }

  // Validate date of birth (first 6 digits)
  const year = parseInt(cleaned.substring(0, 2))
  const month = parseInt(cleaned.substring(2, 4))
  const day = parseInt(cleaned.substring(4, 6))

  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false

  // Validate checksum using Luhn algorithm
  let sum = 0
  let isSecond = false

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let digit = parseInt(cleaned[i])

    if (isSecond) {
      digit *= 2
      if (digit > 9) {
        digit -= 9
      }
    }

    sum += digit
    isSecond = !isSecond
  }

  return sum % 10 === 0
}

/**
 * Extract information from SA ID number
 */
export function parseSAIDNumber(idNumber: string) {
  const cleaned = idNumber.replace(/\s/g, '')
  
  if (!isValidSAIDNumber(cleaned)) {
    return null
  }

  const year = parseInt(cleaned.substring(0, 2))
  const month = parseInt(cleaned.substring(2, 4))
  const day = parseInt(cleaned.substring(4, 6))
  const gender = parseInt(cleaned.substring(6, 10)) >= 5000 ? 'Male' : 'Female'
  const citizenship = cleaned[10] === '0' ? 'SA Citizen' : 'Permanent Resident'

  // Determine full year (assume 00-30 is 2000s, 31-99 is 1900s)
  const fullYear = year <= 30 ? 2000 + year : 1900 + year

  // Calculate age
  const birthDate = new Date(fullYear, month - 1, day)
  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--
  }

  return {
    dateOfBirth: `${fullYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
    age,
    gender,
    citizenship,
  }
}

/**
 * Validate South African physical address
 */
export function isValidSAAddress(address: string): boolean {
  const cleaned = address.trim()
  // Must be at least 10 characters and contain some numbers or letters
  return cleaned.length >= 10 && /[0-9]/.test(cleaned) && /[a-zA-Z]/.test(cleaned)
}

/**
 * Validate document file type
 */
export function isValidDocumentType(mimeType: string): boolean {
  const validTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/heic',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
  return validTypes.includes(mimeType.toLowerCase())
}

/**
 * Get experience level code
 */
export function getExperienceLevelCode(level: string): string {
  const levels: Record<string, string> = {
    'general_worker': 'GW',
    'semi_skilled': 'SS',
    'skilled_worker': 'SW',
    'professional': 'PR'
  }
  return levels[level] || 'GW'
}

/**
 * Validate certificate number format
 */
export function isValidCertificateNumber(certNumber: string): boolean {
  const cleaned = certNumber.trim()
  // Must be at least 4 characters, alphanumeric
  return cleaned.length >= 4 && /^[A-Z0-9-]+$/i.test(cleaned)
}