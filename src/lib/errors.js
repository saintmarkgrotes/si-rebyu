// Turns a Supabase/PostgREST error into something a student would actually understand, without
// losing other errors (network issues, RLS denials phrased usefully by Postgres) along the way.

// PostgREST's code for .single() finding zero or more than one row — in practice this almost always
// means "not found or not yours", since RLS hides rows you don't own rather than erroring on them.
const NOT_FOUND_CODE = 'PGRST116'
const NOT_FOUND_PATTERN = /multiple \(or no\) rows returned/i

export const isRowNotFoundError = (error) =>
  error?.code === NOT_FOUND_CODE || NOT_FOUND_PATTERN.test(error?.message || '')

export const friendlyRowError = (error, notFoundMessage, fallbackMessage) =>
  isRowNotFoundError(error) ? notFoundMessage : error?.message || fallbackMessage
