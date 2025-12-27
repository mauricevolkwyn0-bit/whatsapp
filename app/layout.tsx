import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'JUST WORK - WhatsApp Service Marketplace',
  description: 'Get work done through WhatsApp',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}