import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    env: {
      hasOpenAI: Boolean(process.env.OPENAI_API_KEY),
      hasProkeralaClientId: Boolean(process.env.PROKERALA_CLIENT_ID),
      hasProkeralaClientSecret: Boolean(process.env.PROKERALA_CLIENT_SECRET),
      hasSupabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      hasSupabaseKey: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ),
    },
  });
}
