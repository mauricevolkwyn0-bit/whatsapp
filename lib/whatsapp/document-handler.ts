// lib/whatsapp/document-handler.ts
// Download documents and store as base64 in conversation state
// Only upload to Supabase Storage when ALL documents are collected

const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!

// ═══════════════════════════════════════════════════════════════
// DOWNLOAD DOCUMENT AND STORE AS BASE64 (NOT IN STORAGE YET)
// ═══════════════════════════════════════════════════════════════
export async function downloadDocumentAsBase64(
  mediaId: string,
  documentType: string
): Promise<{ base64: string; mimeType: string; fileName: string }> {
  try {
    console.log('📥 [DOWNLOAD] Downloading document from WhatsApp:', { mediaId, documentType });

    // Step 1: Get media info from WhatsApp
    const mediaInfoResponse = await fetch(
      `https://graph.facebook.com/v22.0/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
        },
      }
    );

    if (!mediaInfoResponse.ok) {
      const errorText = await mediaInfoResponse.text();
      console.error('❌ [DOWNLOAD] WhatsApp API error:', errorText);
      throw new Error(`WhatsApp API error: ${mediaInfoResponse.status}`);
    }

    const mediaInfo = await mediaInfoResponse.json();
    console.log('✅ [DOWNLOAD] Media info:', {
      mimeType: mediaInfo.mime_type,
      size: mediaInfo.file_size,
    });

    // Step 2: Download the actual file
    const mediaResponse = await fetch(mediaInfo.url, {
      headers: {
        'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
      },
    });

    if (!mediaResponse.ok) {
      throw new Error(`Failed to download file: ${mediaResponse.status}`);
    }

    const fileBuffer = await mediaResponse.arrayBuffer();
    console.log('✅ [DOWNLOAD] File downloaded:', {
      sizeKB: (fileBuffer.byteLength / 1024).toFixed(2),
    });

    // Step 3: Convert to base64 (for storing in conversation state)
    const base64 = Buffer.from(fileBuffer).toString('base64');
    
    const fileExtension = getFileExtension(mediaInfo.mime_type);
    const fileName = `${sanitizeFileName(documentType)}_${Date.now()}${fileExtension}`;

    console.log('✅ [DOWNLOAD] Converted to base64, ready for storage in state');

    return {
      base64,
      mimeType: mediaInfo.mime_type,
      fileName,
    };
  } catch (error) {
    console.error('❌ [DOWNLOAD] Download failed:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// UPLOAD ALL DOCUMENTS TO STORAGE (CALLED ONLY AT THE END)
// ═══════════════════════════════════════════════════════════════
export async function uploadAllDocumentsToStorage(
  documents: Record<string, { base64: string; mimeType: string; fileName: string }>,
  applicantId: string
): Promise<Record<string, string>> {
  try {
    console.log('☁️ [UPLOAD] Uploading all documents to Supabase Storage:', {
      count: Object.keys(documents).length,
      applicantId,
    });

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    const uploadedUrls: Record<string, string> = {};

    // Upload each document
    for (const [docType, docData] of Object.entries(documents)) {
      console.log(`📤 [UPLOAD] Uploading ${docType}...`);

      // Convert base64 back to buffer
      const fileBuffer = Buffer.from(docData.base64, 'base64');
      
      // Storage path
      const storagePath = `${applicantId}/${docData.fileName}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('applicant-documents')
        .upload(storagePath, fileBuffer, {
          contentType: docData.mimeType,
          upsert: true,
        });

      if (error) {
        console.error(`❌ [UPLOAD] Failed to upload ${docType}:`, error);
        throw error;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('applicant-documents')
        .getPublicUrl(storagePath);

      uploadedUrls[docType] = urlData.publicUrl;
      console.log(`✅ [UPLOAD] ${docType} uploaded:`, urlData.publicUrl);
    }

    console.log('✅ [UPLOAD] All documents uploaded successfully!');
    return uploadedUrls;
  } catch (error) {
    console.error('❌ [UPLOAD] Failed to upload documents:', error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function getFileExtension(mimeType: string): string {
  const mimeMap: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/heic': '.heic',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  };
  
  return mimeMap[mimeType.toLowerCase()] || '.bin';
}

function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}