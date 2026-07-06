import { NextResponse } from "next/server";
import type { BhagyaService } from "@/app/api/_lib/bhagyaPrompt";
import { requireUser } from "@/lib/backend/auth";
import { createUserChat, listUserChats } from "@/lib/backend/chats";
import { safeErrorResponse } from "@/lib/backend/errors";

const allowedServices: BhagyaService[] = [
  "astrology",
  "numerology",
  "tarot",
  "palmistry",
];
const routeName = "api/chats";

function unauthorizedResponse() {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Please login to continue." },
    { status: 401 }
  );
}

export async function GET(request: Request) {
  let userId: string | undefined;

  try {
    const { user, error: authError } = await requireUser(request);

    if (authError || !user) {
      return unauthorizedResponse();
    }

    userId = user.id;
    const chats = await listUserChats(request, user.id);

    return NextResponse.json({ chats });
  } catch (error) {
    return safeErrorResponse(error, routeName, userId);
  }
}

export async function POST(request: Request) {
  let userId: string | undefined;

  try {
    const { user, error: authError } = await requireUser(request);

    if (authError || !user) {
      return unauthorizedResponse();
    }

    userId = user.id;
    const body = (await request.json()) as Record<string, unknown>;
    const requestedService =
      typeof body.service === "string" ? body.service : "astrology";
    const service = allowedServices.includes(requestedService as BhagyaService)
      ? (requestedService as BhagyaService)
      : "astrology";
    const languageCode =
      typeof body.languageCode === "string" ? body.languageCode : "english";
    const title = typeof body.title === "string" ? body.title : "New Reading";
    const chat = await createUserChat({
      request,
      userId: user.id,
      title,
      service,
      languageCode,
    });

    return NextResponse.json({ chat });
  } catch (error) {
    return safeErrorResponse(error, routeName, userId);
  }
}
