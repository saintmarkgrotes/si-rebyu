import { supabase } from './supabase'

export async function startStudySession(userId, documentId = null) {
  const { data, error } = await supabase
    .from('study_sessions')
    .insert({ user_id: userId, document_id: documentId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function endStudySession(sessionId, topicIds = []) {
  const { data, error } = await supabase
    .from('study_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single()
  if (error) throw error

  if (topicIds.length) {
    const rows = topicIds.map((topic_id) => ({ session_id: sessionId, topic_id }))
    const { error: topicError } = await supabase.from('study_session_topics').insert(rows)
    if (topicError) throw topicError
  }
  return data
}

export async function getRecentSessions(limit = 10) {
  const { data, error } = await supabase
    .from('study_sessions')
    .select('*, documents(title), study_session_topics(topics(name))')
    .order('started_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data
}