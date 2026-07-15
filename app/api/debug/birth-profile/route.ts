import { requireUser } from "@/lib/backend/auth";
import { createSupabaseUserClient } from "@/lib/backend/supabaseUserClient";

export async function GET(request: Request) {
  const { user, error } = await requireUser(request);

  if (error || !user) {
    return Response.json(
      {
        authenticated: false,
        canReadProfile: false,
        canReadBirthDetails: false,
        profileColumnsAvailable: false,
        birthDetailsColumnsAvailable: false,
      },
      { status: 401 }
    );
  }

  const supabase = createSupabaseUserClient(request);
  const [profileRead, birthDetailsRead, profileColumns, birthDetailsColumns] =
    await Promise.all([
      supabase.from("profiles").select("id").eq("id", user.id).limit(1),
      supabase
        .from("user_birth_details")
        .select("id")
        .eq("user_id", user.id)
        .limit(1),
      supabase
        .from("profiles")
        .select("id,full_name,first_name,email,updated_at")
        .eq("id", user.id)
        .limit(1),
      supabase
        .from("user_birth_details")
        .select(
          "id,user_id,date_of_birth,birth_time,birth_time_known,birth_place,latitude,longitude,timezone_offset,timezone_id,updated_at"
        )
        .eq("user_id", user.id)
        .limit(1),
    ]);

  return Response.json({
    authenticated: true,
    canReadProfile: !profileRead.error,
    canReadBirthDetails: !birthDetailsRead.error,
    profileColumnsAvailable: !profileColumns.error,
    birthDetailsColumnsAvailable: !birthDetailsColumns.error,
  });
}
