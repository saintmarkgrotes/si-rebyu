import { supabase } from './supabase'
import { apiFetch } from './api'

// Reads go straight to Supabase (row level security keeps them to your own rows);
// anything that needs the AI or the processing pipeline goes through the backend.

export const getStudySets = async () => {
  const { data, error } = await supabase
    .from('study_sets')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

// Topics the AI found in this document during earlier generations, so later sets can focus on some of them.
export const getDocumentTopics = async (documentId) => {
  const { data, error } = await supabase
    .from('document_topics')
    .select('topics(id, name)')
    .eq('document_id', documentId)
  if (error) throw error
  return data
    .map((row) => row.topics?.name)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
}

// `body` is the payload built by toPayload() in lib/generation.js
export const estimateGeneration = (documentId, body) =>
  apiFetch(`/documents/${documentId}/study-sets/estimate`, { method: 'POST', body })

export const startGeneration = (documentId, body) =>
  apiFetch(`/documents/${documentId}/study-sets`, { method: 'POST', body })

export const deleteStudySet = async (id) => {
  const { error } = await supabase.from('study_sets').delete().eq('id', id)
  if (error) throw error
}
