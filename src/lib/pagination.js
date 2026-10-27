// Fetch successive pages to avoid Supabase silently truncating a list at its row limit.
export const fetchAll = async (query, pageSize = 500) => {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query().range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
}
