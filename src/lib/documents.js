import { supabase } from './supabase'

export async function uploadDocument(file, userId) {
  const filePath = `${userId}/${Date.now()}_${file.name}`
  const { error: uploadError } = await supabase.storage.from('documents').upload(filePath, file)
  if (uploadError) throw uploadError

  const fileType = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx'
  const { data, error } = await supabase
    .from('documents')
    .insert({ user_id: userId, title: file.name, file_type: fileType, storage_path: filePath })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function getDocuments() {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getDocumentWithQuestions(documentId) {
  const { data, error } = await supabase
    .from('documents')
    .select('*, questions(*)')
    .eq('id', documentId)
    .single()
  if (error) throw error
  return data
}

export async function deleteDocument(documentId, storagePath) {
  const { error: storageError } = await supabase.storage.from('documents').remove([storagePath])
  if (storageError) throw storageError
  const { error } = await supabase.from('documents').delete().eq('id', documentId)
  if (error) throw error
}