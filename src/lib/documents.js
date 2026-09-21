import { supabase } from './supabase'

const FILE_TYPES = { pdf: 'pdf', docx: 'docx', pptx: 'pptx' }

// Storage keys can break on spaces/accents/symbols, so keep only safe characters.
// The original name is still saved as the document title.
const toSafeFileName = (name) => {
  const dot = name.lastIndexOf('.')
  const ext = dot > -1 ? name.slice(dot + 1).toLowerCase() : ''
  const base = (dot > -1 ? name.slice(0, dot) : name)
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
  return `${base || 'document'}${ext ? `.${ext}` : ''}`
}

export const uploadDocument = async (file, userId) => {
  const ext = file.name.split('.').pop().toLowerCase()
  const fileType = FILE_TYPES[ext]
  if (!fileType) throw new Error('Only PDF, Word (.docx) or PowerPoint (.pptx) files are supported.')

  const filePath = `${userId}/${Date.now()}_${toSafeFileName(file.name)}`
  const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file)
  if (uploadError) throw uploadError

  const { data, error } = await supabase
    .from('documents')
    .insert({ user_id: userId, title: file.name, file_type: fileType, storage_path: filePath })
    .select()
    .single()
  if (error) {
    // don't leave an orphaned file behind if the row couldn't be created
    await supabase.storage.from('documents').remove([filePath])
    throw error
  }
  return data
}

export const getDocuments = async () => {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export const getDocumentWithQuestions = async (documentId) => {
  const { data, error } = await supabase
    .from('documents')
    .select('*, questions(*)')
    .eq('id', documentId)
    .single()
  if (error) throw error
  return data
}

export const deleteDocument = async (documentId, storagePath) => {
  const { error: storageError } = await supabase.storage.from('documents').remove([storagePath])
  if (storageError) throw storageError
  const { error } = await supabase.from('documents').delete().eq('id', documentId)
  if (error) throw error
}