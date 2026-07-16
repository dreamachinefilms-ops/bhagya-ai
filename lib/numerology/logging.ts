type SupabaseErrorLike = {
  code?: unknown;
  message?: unknown;
  hint?: unknown;
};

export function logNumerologyStage(
  stage: string,
  details: Record<string, string | number | boolean | null | undefined> = {},
) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[numerology] ${stage}`, details);
  }
}

export function getSafeSupabaseError(error: unknown) {
  const value = error as SupabaseErrorLike;
  return {
    code: typeof value?.code === "string" ? value.code : "UNKNOWN",
    message:
      typeof value?.message === "string"
        ? value.message
        : "Unknown Supabase operation failure.",
    hint: typeof value?.hint === "string" ? value.hint : undefined,
  };
}

export function logNumerologySupabaseError({
  stage,
  query,
  error,
}: {
  stage: string;
  query: string;
  error: unknown;
}) {
  console.error(`[numerology] ${stage}`, {
    query,
    ...getSafeSupabaseError(error),
  });
}
