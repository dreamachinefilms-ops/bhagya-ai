import { createClient, type User } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );
}

const supabaseAuth = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export async function requireUser(request: Request): Promise<{
  user: User | null;
  error: "UNAUTHORIZED" | null;
}> {
  const authHeader = request.headers.get("authorization");

  console.log("Bhagya API auth check:", {
    hasAuthHeader: Boolean(authHeader),
    hasBearerPrefix: Boolean(authHeader?.startsWith("Bearer ")),
  });

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      user: null,
      error: "UNAUTHORIZED",
    };
  }

  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return {
      user: null,
      error: "UNAUTHORIZED",
    };
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);

  if (error || !data.user) {
    console.warn("Bhagya API auth failed:", {
      hasSupabaseError: Boolean(error),
      hasUser: Boolean(data.user),
    });
    return {
      user: null,
      error: "UNAUTHORIZED",
    };
  }

  return {
    user: data.user,
    error: null,
  };
}

export class UnauthorizedError extends Error {
  constructor() {
    super("UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export async function requireAuthenticatedUser(request: Request) {
  const { user, error } = await requireUser(request);

  if (error || !user) {
    throw new UnauthorizedError();
  }

  return user;
}

export function getRequestAccessToken(request?: Request) {
  const authHeader = request?.headers.get("authorization") || "";
  return authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : undefined;
}
