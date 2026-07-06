import type { SupabaseClient } from "@supabase/supabase-js";
import type { BhagyaService } from "@/app/api/_lib/bhagyaPrompt";
import { createSupabaseUserClient } from "./supabaseUserClient";
import { makeChatTitle } from "./conversation";
import { logSafeError } from "./errors";
import { isUuid, ValidationError } from "./validation";

type ChatMessageInput = {
  role: "user" | "assistant";
  content: string;
  service?: string;
  languageCode?: string;
};

async function getSupabaseForRequest(request: Request) {
  return createSupabaseUserClient(request);
}

async function ensureChat({
  supabase,
  chatId,
  userId,
  title,
  service,
  languageCode,
}: {
  supabase: SupabaseClient;
  chatId?: string;
  userId: string;
  title: string;
  service: BhagyaService;
  languageCode: string;
}) {
  if (chatId) {
    if (!isUuid(chatId)) {
      throw new ValidationError("Invalid chat id.");
    }

    const { data: existingChat, error } = await supabase
      .from("chats")
      .select("id")
      .eq("id", chatId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (existingChat?.id) return existingChat.id as string;

    throw new ValidationError("Chat not found.");
  }

  const { data, error } = await supabase
    .from("chats")
    .insert({
      user_id: userId,
      title,
      service,
      language_code: languageCode,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id as string;
}

export async function saveAiExchange({
  request,
  routeName,
  userId,
  chatId,
  service,
  languageCode,
  question,
  answer,
}: {
  request: Request;
  routeName: string;
  userId: string;
  chatId?: string;
  service: BhagyaService;
  languageCode: string;
  question: string;
  answer: string;
}) {
  if (request.headers.get("x-bhagya-skip-persistence") === "true") {
    return { chatId, saved: false };
  }

  try {
    const supabase = await getSupabaseForRequest(request);
    const savedChatId = await ensureChat({
      supabase,
      chatId,
      userId,
      title: makeChatTitle(question),
      service,
      languageCode,
    });

    const { error } = await supabase.from("messages").insert([
      {
        chat_id: savedChatId,
        user_id: userId,
        role: "user",
        content: question,
        service,
        language_code: languageCode,
      },
      {
        chat_id: savedChatId,
        user_id: userId,
        role: "assistant",
        content: answer,
        service,
        language_code: languageCode,
      },
    ]);

    if (error) throw error;

    await supabase
      .from("chats")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", savedChatId)
      .eq("user_id", userId);

    return { chatId: savedChatId, saved: true };
  } catch (error) {
    logSafeError(routeName, userId, error);
    return { chatId, saved: false };
  }
}

export async function listUserChats(request: Request, userId: string) {
  const supabase = await getSupabaseForRequest(request);
  const { data, error } = await supabase
    .from("chats")
    .select("id,title,service,language_code,created_at,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function createUserChat({
  request,
  userId,
  title,
  service,
  languageCode,
}: {
  request: Request;
  userId: string;
  title: string;
  service: BhagyaService;
  languageCode: string;
}) {
  const supabase = await getSupabaseForRequest(request);
  const { data, error } = await supabase
    .from("chats")
    .insert({
      user_id: userId,
      title: makeChatTitle(title),
      service,
      language_code: languageCode,
    })
    .select("id,title,service,language_code,created_at,updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function listChatMessages({
  request,
  userId,
  chatId,
}: {
  request: Request;
  userId: string;
  chatId: string;
}) {
  const supabase = await getSupabaseForRequest(request);
  await getUserChat({ supabase, userId, chatId });

  const { data, error } = await supabase
    .from("messages")
    .select("id,chat_id,role,content,service,language_code,created_at")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function findUserChat({
  supabase,
  userId,
  chatId,
}: {
  supabase: SupabaseClient;
  userId: string;
  chatId: string;
}) {
  const { data, error } = await supabase
    .from("chats")
    .select("id,user_id,title,service,language_code,created_at,updated_at")
    .eq("id", chatId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;

  return data || null;
}

export async function getUserChat({
  supabase,
  userId,
  chatId,
}: {
  supabase: SupabaseClient;
  userId: string;
  chatId: string;
}) {
  const data = await findUserChat({ supabase, userId, chatId });

  if (data?.id) return data;

  throw new ValidationError("Chat not found.");
}

export async function addChatMessage({
  request,
  userId,
  chatId,
  message,
}: {
  request: Request;
  userId: string;
  chatId: string;
  message: ChatMessageInput;
}) {
  const supabase = await getSupabaseForRequest(request);
  await getUserChat({ supabase, userId, chatId });

  const { data, error } = await supabase
    .from("messages")
    .insert({
      chat_id: chatId,
      user_id: userId,
      role: message.role,
      content: message.content,
      service: message.service,
      language_code: message.languageCode,
    })
    .select("id,chat_id,role,content,service,language_code,created_at")
    .single();

  if (error) throw error;

  const { error: updateError } = await supabase
    .from("chats")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", chatId)
    .eq("user_id", userId);

  if (updateError) throw updateError;

  return data;
}
