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