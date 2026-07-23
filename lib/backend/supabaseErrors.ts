type SupabaseErrorLike = {
  code?: unknown;
};

const SCHEMA_UNAVAILABLE_CODES = new Set([
  "PGRST204",
  "PGRST205",
  "42P01",
  "42703",
]);

export function isSupabaseSchemaUnavailable(error: unknown) {
  const code = (error as SupabaseErrorLike | null)?.code;
  return typeof code === "string" && SCHEMA_UNAVAILABLE_CODES.has(code);
}
