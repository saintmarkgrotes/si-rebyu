import { supabase } from './supabase'

export async function getTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('is_done', { ascending: true })
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function addTask(userId, { title, note, dueDate }) {
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      title: title.trim(),
      note: note?.trim() || null,
      due_date: dueDate || null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function setTaskDone(taskId, isDone) {
  const { data, error } = await supabase
    .from('tasks')
    .update({ is_done: isDone })
    .eq('id', taskId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTask(taskId) {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId)
  if (error) throw error
}