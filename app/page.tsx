"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import ImageUploader, { type UploadedImage } from "@/components/ImageUploader";
import LanguageSelector from "@/components/LanguageSelector";
import PalmScanAnimation from "@/components/PalmScanAnimation";
import { preparePalmImage } from "@/lib/images/preparePalmImage";
import {
  DEFAULT_LANGUAGE_CODE,
  LANGUAGE_DEFAULT_MIGRATION_KEY,
  LANGUAGE_STORAGE_KEY,
  languages,
  UI_TEXT,
  type LanguageCode,
  type UiText,
} from "@/lib/languages";
import { supabase } from "@/lib/supabaseClient";
import type { PalmVisualMap } from "@/lib/palmistry/visualMap";

type ServiceType = "numerology" | "tarot" | "palmistry" | "astrology";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  service: ServiceType;
  languageCode?: LanguageCode;
  isLoading?: boolean;
};

type ImageMessagePayload = {
  type: "bhagya.image";
  mode: "palmistry";
  text: string;
  imageUrl?: string;
  storagePath?: string;
  imageName?: string;
  imageMimeType?: string;
  imageSize?: number;
};

type ParsedMessageContent = {
  text: string;
  imageUrl?: string;
  storagePath?: string;
  imageName?: string;
};

type PalmAnalysisError = {
  code: string;
  message: string;
  image: UploadedImage;
} | null;

type Chat = {
  id: string;
  title: string;
  service: ServiceType;
  messages: Message[];
  updatedAt: number;
};

type BirthDetailsStatus = {
  complete?: boolean;
  code?: string;
};

const PENDING_QUESTION_KEY = "bhagya_pending_question_v1";
const IMAGE_MESSAGE_TYPE = "bhagya.image";
const PALM_UPLOAD_TEXT = "Palm photo uploaded for analysis.";
const PALM_ANALYSIS_LOADING_TEXT = "Bhagya is studying the lines of your palm...";
const PALM_ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PALM_MAX_FILE_SIZE = 20 * 1024 * 1024;
const PALM_IMAGE_BUCKET = "palm-images";
const PALM_PREPARING_STATUS = "Preparing your palm photo...";
const PALM_UPLOADING_STATUS = "Uploading securely...";
const PALM_MAPPING_STATUS = "Mapping your palm...";
const services: {
  id: ServiceType;
  label: string;
  icon: string;
  api: string;
  glyph: string;
}[] = [
  {
    id: "astrology",
    label: "Astrology",
    icon: "✨",
    api: "/api/astrology",
    glyph: "♈",
  },
  {
    id: "numerology",
    label: "Numerology",
    icon: "🔢",
    api: "/api/numerology",
    glyph: "∞",
  },
  {
    id: "tarot",
    label: "Tarot",
    icon: "🃏",
    api: "/api/tarot",
    glyph: "☽",
  },
  {
    id: "palmistry",
    label: "Palmistry",
    icon: "✋",
    api: "/api/palmistry",
    glyph: "⚡",
  },
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeTitle(text: string) {
  return text.length > 38 ? `${text.slice(0, 38)}…` : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function makeImageMessageContent({
  image,
  imageUrl,
  storagePath,
}: {
  image: UploadedImage;
  imageUrl?: string;
  storagePath?: string;
}): string {
  const payload: ImageMessagePayload = {
    type: IMAGE_MESSAGE_TYPE,
    mode: "palmistry",
    text: PALM_UPLOAD_TEXT,
    imageUrl,
    storagePath,
    imageName: image.name,
    imageMimeType: image.mimeType,
    imageSize: image.size,
  };

  return JSON.stringify(payload);
}

function parseMessageContent(content: string): ParsedMessageContent {
  if (!content.trim().startsWith("{")) {
    return { text: content };
  }

  try {
    const payload: unknown = JSON.parse(content);

    if (
      isRecord(payload) &&
      payload.type === IMAGE_MESSAGE_TYPE &&
      typeof payload.imageUrl === "string"
    ) {
      return {
        text: typeof payload.text === "string" ? payload.text : "",
        imageUrl: payload.imageUrl,
        storagePath:
          typeof payload.storagePath === "string"
            ? payload.storagePath
            : undefined,
        imageName:
          typeof payload.imageName === "string" ? payload.imageName : undefined,
      };
    }

    if (
      isRecord(payload) &&
      payload.type === IMAGE_MESSAGE_TYPE &&
      typeof payload.storagePath === "string"
    ) {
      return {
        text: typeof payload.text === "string" ? payload.text : "",
        storagePath: payload.storagePath,
        imageName:
          typeof payload.imageName === "string" ? payload.imageName : undefined,
      };
    }
  } catch {
    return { text: content };
  }

  return { text: content };
}

function chatHasPalmImage(chat: Chat | undefined) {
  return Boolean(
    chat?.messages.some(
      (message) =>
        message.service === "palmistry" &&
        Boolean(parseMessageContent(message.content).imageUrl)
    )
  );
}

function chatHasPalmStoragePath(chat: Chat | undefined, storagePath: string) {
  return Boolean(
    chat?.messages.some(
      (message) => parseMessageContent(message.content).storagePath === storagePath
    )
  );
}

function getPalmAnalysisErrorMessage(data: unknown, fallbackStatus: number) {
  const fallback = `Could not analyse your palm. Error ${fallbackStatus}.`;

  if (!isRecord(data)) return fallback;

  const code = typeof data.code === "string" ? data.code : "";
  const message = typeof data.message === "string" ? data.message : "";

  const messages: Record<string, string> = {
    AUTH_REQUIRED: "Please sign in again to analyse your palm.",
    IMAGE_REQUIRED: "Please upload a palm photo first.",
    IMAGE_TOO_LARGE: "Please choose an image smaller than 20 MB.",
    UNSUPPORTED_IMAGE: "Please upload a JPG, PNG or WEBP image.",
    PALM_PREPARATION_FAILED:
      "This photo is too large to process. Please choose a slightly smaller image.",
    PALM_UPLOAD_FAILED:
      "Your palm photo could not be uploaded. Please check your connection and try again.",
    PALM_IMAGE_ACCESS_FAILED:
      "Bhagya could not access this photo. Please upload it again.",
    INVALID_STORAGE_PATH: "This palm photo cannot be accessed.",
    STORAGE_PATH_REQUIRED:
      "The image was uploaded, but the palm analysis could not be completed.",
    STORAGE_PATH_FORBIDDEN:
      "This palm photo cannot be analysed from your account.",
    IMAGE_RETRIEVE_FAILED:
      "The image was uploaded, but could not be retrieved for analysis.",
    DB_SAVE_FAILED:
      "Your reading was generated, but could not be saved. Please try again.",
    OPENAI_TIMEOUT: "The palm analysis took too long. Please try again.",
    PALM_ANALYSIS_FAILED:
      "Bhagya could not analyse this palm photo right now. Please try again.",
  };

  if (code === "PALM_NOT_CLEAR" && message) return message;

  return messages[code] || message || fallback;
}

function isServiceType(value: unknown): value is ServiceType {
  return (
    value === "astrology" ||
    value === "numerology" ||
    value === "tarot" ||
    value === "palmistry"
  );
}

function isLanguageCode(value: unknown): value is LanguageCode {
  return (
    typeof value === "string" &&
    languages.some((language) => language.code === value)
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizePalmFileName(name: string) {
  return (
    name
      .trim()
      .replace(/[/\\]/g, "-")
      .replace(/[^a-zA-Z0-9._-]/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "palm-photo"
  );
}

function getRealisticReplyDelay(answer: string) {
  const baseDelay = 1500;
  const readingDelay = Math.min(answer.length * 12, 1800);
  const randomDelay = Math.floor(Math.random() * 700);

  return baseDelay + readingDelay + randomDelay;
}

function timeAgo(ts: number, labels: UiText["timeAgo"]) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return labels.justNow;
  if (diff < 3600)
    return labels.minutes.replace("{count}", String(Math.floor(diff / 60)));
  if (diff < 86400)
    return labels.hours.replace("{count}", String(Math.floor(diff / 3600)));
  return labels.days.replace("{count}", String(Math.floor(diff / 86400)));
}

export default function Home() {
  const router = useRouter();

  const [selectedService, setSelectedService] =
    useState<ServiceType>("astrology");
  const [selectedLanguage, setSelectedLanguage] =
    useState<LanguageCode>(DEFAULT_LANGUAGE_CODE);
  const [hasLoadedLanguage, setHasLoadedLanguage] = useState(false);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [palmImage, setPalmImage] = useState<UploadedImage | null>(null);
  const [isPalmAnalyzing, setIsPalmAnalyzing] = useState(false);
  const [palmScanImageUrl, setPalmScanImageUrl] = useState("");
  const [isPalmScanReady, setIsPalmScanReady] = useState(false);
  const [palmScanStatus, setPalmScanStatus] = useState(PALM_MAPPING_STATUS);
  const [palmVisualMap, setPalmVisualMap] = useState<PalmVisualMap | null>(null);
  const [palmAnalysisError, setPalmAnalysisError] =
    useState<PalmAnalysisError>(null);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isCheckingBirthProfile, setIsCheckingBirthProfile] = useState(false);
  const [hasCompleteBirthProfile, setHasCompleteBirthProfile] =
    useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousChatIdRef = useRef<string | null>(null);
  const palmVisualMapCacheRef = useRef<Record<string, PalmVisualMap>>({});
  const palmVisualMapRequestRef = useRef(0);
  const palmScanObjectUrlRef = useRef<string | null>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId);
  const activeChatHasPalmImage = chatHasPalmImage(activeChat);
  const hasStarted = Boolean(activeChatId);
  const isPreparingBirthProfile = isLoggedIn && isCheckingBirthProfile;
  const showMobileLanding =
    !isLoggedIn && !hasStarted && !isPreparingBirthProfile;
  const selectedApi = services.find((s) => s.id === selectedService)?.api;
  const t = UI_TEXT[selectedLanguage];
  const selectedLanguageLabel =
    languages.find((lang) => lang.code === selectedLanguage)?.label ||
    "English";

  const getAuthHeaders = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) return null;

    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    };
  }, []);

  const mapDbChat = useCallback((chat: Record<string, unknown>): Chat => {
    const updatedAt =
      typeof chat.updated_at === "string"
        ? new Date(chat.updated_at).getTime()
        : Date.now();

    return {
      id: typeof chat.id === "string" ? chat.id : makeId(),
      title: typeof chat.title === "string" ? chat.title : "Reading",
      service: isServiceType(chat.service) ? chat.service : "astrology",
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
      messages: [],
    };
  }, []);

  const mapDbMessage = useCallback(
    (message: Record<string, unknown>, fallbackService?: ServiceType): Message => ({
      id: typeof message.id === "string" ? message.id : makeId(),
      role: message.role === "assistant" ? "assistant" : "user",
      content: typeof message.content === "string" ? message.content : "",
      service: isServiceType(message.service)
        ? message.service
        : fallbackService || "astrology",
      languageCode: isLanguageCode(message.language_code)
        ? message.language_code
        : undefined,
    }),
    []
  );

  const loadUserChats = useCallback(async () => {
    const headers = await getAuthHeaders();

    if (!headers) return;

    setIsLoadingChats(true);

    try {
      const res = await fetch("/api/chats", {
        method: "GET",
        headers,
      });

      if (!res.ok) return;

      const data = (await res.json()) as { chats?: unknown[] };
      const loadedChats = (Array.isArray(data.chats) ? data.chats : [])
        .filter((chat): chat is Record<string, unknown> =>
          Boolean(chat && typeof chat === "object" && !Array.isArray(chat))
        )
        .map(mapDbChat);

      setChats((prev) => {
        const messageMap = new Map(
          prev.map((chat) => [chat.id, chat.messages] as const)
        );

        return loadedChats.map((chat) => ({
          ...chat,
          messages: messageMap.get(chat.id) || [],
        }));
      });
    } finally {
      setIsLoadingChats(false);
    }
  }, [getAuthHeaders, mapDbChat]);

  useEffect(() => {
    const migrated = localStorage.getItem(LANGUAGE_DEFAULT_MIGRATION_KEY);
    let savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);

    if (!migrated) {
      if (!savedLanguage || savedLanguage === "hinglish") {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE_CODE);
        savedLanguage = DEFAULT_LANGUAGE_CODE;
      }

      localStorage.setItem(LANGUAGE_DEFAULT_MIGRATION_KEY, "true");
    }

    if (isLanguageCode(savedLanguage)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the persisted client preference after mount
      setSelectedLanguage(savedLanguage);
    } else {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, DEFAULT_LANGUAGE_CODE);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- default to English when no persisted preference exists
      setSelectedLanguage(DEFAULT_LANGUAGE_CODE);
    }

    setHasLoadedLanguage(true);
  }, []);

  useEffect(() => {
    if (hasLoadedLanguage) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, selectedLanguage);
    }
  }, [hasLoadedLanguage, selectedLanguage]);

  useEffect(() => {
    if (isCheckingAuth) return;

    if (isLoggedIn && hasCompleteBirthProfile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- load persisted chats after auth state is known
      void loadUserChats();
      return;
    }

    if (!isLoggedIn) {
      setChats([]);
      setActiveChatId(null);
      setIsSidebarOpen(false);
      setHasCompleteBirthProfile(false);
    }
  }, [hasCompleteBirthProfile, isCheckingAuth, isLoggedIn, loadUserChats]);

  useEffect(() => {
    if (isCheckingAuth) return;

    if (!isLoggedIn) {
      setIsCheckingBirthProfile(false);
      setHasCompleteBirthProfile(false);
      return;
    }

    let isMounted = true;

    async function checkBirthProfile() {
      setIsCheckingBirthProfile(true);

      const headers = await getAuthHeaders();

      if (!headers) {
        if (isMounted) {
          setIsCheckingBirthProfile(false);
          setHasCompleteBirthProfile(false);
        }
        return;
      }

      try {
        const res = await fetch("/api/birth-details", { headers });

        if (res.status === 401) {
          router.replace("/login?next=/");
          return;
        }

        const data = (await res.json()) as BirthDetailsStatus;

        if (!res.ok || !data.complete) {
          router.replace("/birth-details");
          return;
        }

        if (isMounted) {
          setHasCompleteBirthProfile(true);
        }
      } catch {
        router.replace("/birth-details");
      } finally {
        if (isMounted) {
          setIsCheckingBirthProfile(false);
        }
      }
    }

    void checkBirthProfile();

    return () => {
      isMounted = false;
    };
  }, [getAuthHeaders, isCheckingAuth, isLoggedIn, router]);

  useEffect(() => {
    const scroller = messagesScrollRef.current;

    if (!scroller) return;

    const isNewChat = previousChatIdRef.current !== activeChatId;

    previousChatIdRef.current = activeChatId;

    if (isNewChat) {
      shouldStickToBottomRef.current = true;
    }

    if (!shouldStickToBottomRef.current) return;

    const frame = window.requestAnimationFrame(() => {
      scroller.scrollTo({
        top: scroller.scrollHeight,
        behavior: isNewChat ? "auto" : "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeChatId, activeChat?.messages]);

  useEffect(() => {
    async function checkAuth() {
      const { data } = await supabase.auth.getUser();
      setIsLoggedIn(Boolean(data.user));
      setIsCheckingAuth(false);
    }

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session?.user));
      setIsCheckingAuth(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const pendingQuestion = localStorage.getItem(PENDING_QUESTION_KEY);

    if (pendingQuestion) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the question saved before the auth redirect
      setQuestion(pendingQuestion);
      localStorage.removeItem(PENDING_QUESTION_KEY);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (palmScanObjectUrlRef.current) {
        URL.revokeObjectURL(palmScanObjectUrlRef.current);
        palmScanObjectUrlRef.current = null;
      }
    };
  }, []);

  function startNewChat() {
    setActiveChatId(null);
    setQuestion("");
    setPalmImage(null);
    setPalmAnalysisError(null);
    clearPalmScanImageSource();
    setIsPalmScanReady(false);
    setPalmVisualMap(null);
    setSelectedService("astrology");
    setIsLoading(false);
    setIsPalmAnalyzing(false);
    setIsSidebarOpen(false);
  }

  async function logoutUser() {
    await supabase.auth.signOut();
    setIsLoggedIn(false);
    setChats([]);
    setActiveChatId(null);
    setQuestion("");
    setPalmImage(null);
    setPalmAnalysisError(null);
    clearPalmScanImageSource();
    setIsPalmScanReady(false);
    setPalmVisualMap(null);
    setIsLoading(false);
    setIsPalmAnalyzing(false);
    setIsSidebarOpen(false);
  }

  function getServiceLabel(serviceId: ServiceType) {
    return t.services[serviceId] ?? serviceId;
  }

  function getServiceGlyph(serviceId: ServiceType) {
    return services.find((s) => s.id === serviceId)?.glyph ?? "✨";
  }

  function setPalmScanImageSource(url: string, isObjectUrl = false) {
    if (palmScanObjectUrlRef.current) {
      URL.revokeObjectURL(palmScanObjectUrlRef.current);
      palmScanObjectUrlRef.current = null;
    }

    if (isObjectUrl) {
      palmScanObjectUrlRef.current = url;
    }

    setPalmScanImageUrl(url);
  }

  function clearPalmScanImageSource() {
    setPalmScanImageSource("");
  }

  function updateAssistantMessage(
    chatId: string,
    assistantMessageId: string,
    content: string
  ) {
    setChats((prev) => {
      const updated = prev.map((chat) =>
        chat.id === chatId
          ? {
              ...chat,
              updatedAt: Date.now(),
              messages: chat.messages.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content, isLoading: false }
                  : msg
              ),
            }
          : chat
      );

      const target = updated.find((c) => c.id === chatId);
      const rest = updated.filter((c) => c.id !== chatId);

      return target ? [target, ...rest] : updated;
    });
  }

  async function createServerChat({
    title,
    service,
    languageCode,
  }: {
    title: string;
    service: ServiceType;
    languageCode: LanguageCode;
  }) {
    const headers = await getAuthHeaders();

    if (!headers) return null;

    const res = await fetch("/api/chats", {
      method: "POST",
      headers,
      body: JSON.stringify({
        title,
        service,
        languageCode,
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { chat?: unknown };

    return data.chat &&
      typeof data.chat === "object" &&
      !Array.isArray(data.chat)
      ? mapDbChat(data.chat as Record<string, unknown>)
      : null;
  }

  async function saveServerMessage({
    chatId,
    role,
    content,
    service,
    languageCode,
  }: {
    chatId: string;
    role: "user" | "assistant";
    content: string;
    service: ServiceType;
    languageCode: LanguageCode;
  }) {
    const headers = await getAuthHeaders();

    if (!headers) return null;

    const res = await fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        role,
        content,
        service,
        languageCode,
      }),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as { message?: unknown };

    return data.message &&
      typeof data.message === "object" &&
      !Array.isArray(data.message)
      ? mapDbMessage(data.message as Record<string, unknown>, service)
      : null;
  }

  async function uploadPalmImageForAnalysis({
    image,
    userId,
    chatId,
  }: {
    image: UploadedImage;
    userId: string;
    chatId: string;
  }) {
    if (image.storagePath) return image;

    setPalmScanStatus(PALM_PREPARING_STATUS);
    const preparedFile = await preparePalmImage(image.file).catch((error) => {
      console.error("[palmistry] image preparation failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      throw new Error("PALM_PREPARATION_FAILED");
    });
    const preparedPreviewUrl = URL.createObjectURL(preparedFile);

    setPalmScanImageSource(preparedPreviewUrl, true);

    setPalmScanStatus(PALM_UPLOADING_STATUS);
    const safeFileName = sanitizePalmFileName(
      preparedFile.name || image.name || "palm-upload.jpg"
    ).toLowerCase();
    const uploadId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${preparedFile.lastModified}-${preparedFile.size}`;
    const storagePath = `${userId}/${chatId}/${uploadId}-${safeFileName}`;
    const { data, error } = await supabase.storage
      .from(PALM_IMAGE_BUCKET)
      .upload(storagePath, preparedFile, {
        contentType: preparedFile.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("[palmistry] storage upload failed", {
        message: error.message,
        statusCode: "statusCode" in error ? error.statusCode : undefined,
      });
      throw new Error("PALM_UPLOAD_FAILED");
    }

    setPalmScanStatus(PALM_MAPPING_STATUS);

    return {
      ...image,
      file: preparedFile,
      name: preparedFile.name,
      size: preparedFile.size,
      mimeType: preparedFile.type,
      previewUrl: preparedPreviewUrl,
      storagePath: data?.path || storagePath,
    };
  }

  async function cleanupUnsavedPalmImage(image: UploadedImage | null) {
    if (!image?.storagePath) return;

    const isSaved = chats.some((chat) =>
      chatHasPalmStoragePath(chat, image.storagePath || "")
    );

    if (isSaved) return;

    const { error } = await supabase.storage
      .from(PALM_IMAGE_BUCKET)
      .remove([image.storagePath]);

    if (error) {
      console.error("[palmistry] storage cleanup failed", {
        message: error.message,
        statusCode: "statusCode" in error ? error.statusCode : undefined,
      });
    }
  }

  async function requestPalmVisualMap({
    token,
    storagePath,
    chatId,
  }: {
    token: string;
    storagePath: string;
    chatId: string;
  }) {
    const cachedMap = palmVisualMapCacheRef.current[storagePath];

    if (cachedMap) {
      setPalmVisualMap(cachedMap);
      return cachedMap;
    }

    const requestId = ++palmVisualMapRequestRef.current;

    try {
      const res = await fetch("/api/palmistry/visual-map", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storagePath,
          chatId,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !isRecord(data) || !isRecord(data.visualMap)) {
        console.error("[palmistry] visual map request failed", {
          status: res.status,
          code: isRecord(data) ? data.code : undefined,
        });
        if (requestId === palmVisualMapRequestRef.current) {
          setPalmScanStatus("Palm lines are not clear enough to trace precisely.");
        }
        return null;
      }

      const visualMap = data.visualMap as PalmVisualMap;
      palmVisualMapCacheRef.current[storagePath] = visualMap;

      if (requestId === palmVisualMapRequestRef.current) {
        setPalmVisualMap(visualMap);
      }

      return visualMap;
    } catch (error) {
      console.error("[palmistry] visual map request failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      if (requestId === palmVisualMapRequestRef.current) {
        setPalmScanStatus("Palm lines are not clear enough to trace precisely.");
      }
      return null;
    }
  }

  function handlePalmImageChange(nextImage: UploadedImage | null) {
    if (!nextImage) {
      void cleanupUnsavedPalmImage(palmImage);
    }

    palmVisualMapRequestRef.current += 1;
    setPalmVisualMap(null);
    setPalmImage(nextImage);
    setPalmAnalysisError(null);
  }

  async function handleAsk() {
    const cleanQuestion = question.trim();

    if (!cleanQuestion) {
      inputRef.current?.focus();
      return;
    }

    if (isCheckingAuth || isCheckingBirthProfile || isLoading) return;

    if (!isLoggedIn) {
      localStorage.setItem(PENDING_QUESTION_KEY, cleanQuestion);
      router.push("/login?next=/");
      return;
    }

    if (!hasCompleteBirthProfile) {
      router.replace("/birth-details");
      return;
    }

    const headers = await getAuthHeaders();

    if (!headers) {
      localStorage.setItem(PENDING_QUESTION_KEY, cleanQuestion);
      setIsLoggedIn(false);
      router.push("/login?next=/");
      return;
    }

    setQuestion("");
    setIsLoading(true);

    let chatId = activeChatId;
    let workingChat = chatId
      ? chats.find((chat) => chat.id === chatId) || null
      : null;

    if (!chatId) {
      const newChat = await createServerChat({
        title: makeTitle(cleanQuestion),
        service: selectedService,
        languageCode: selectedLanguage,
      });

      if (!newChat) {
        setQuestion(cleanQuestion);
        setIsLoading(false);
        return;
      }

      chatId = newChat.id;
      workingChat = newChat;
      setActiveChatId(chatId);
      setChats((prev) => [newChat, ...prev]);
    }

    if (!chatId) {
      setQuestion(cleanQuestion);
      setIsLoading(false);
      return;
    }

    const userMessageId = makeId();
    const assistantMessageId = makeId();

    const userMessage: Message = {
      id: userMessageId,
      role: "user",
      content: cleanQuestion,
      service: selectedService,
      languageCode: selectedLanguage,
    };

    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: t.consulting,
      service: selectedService,
      languageCode: selectedLanguage,
      isLoading: true,
    };

    setActiveChatId(chatId);

    setChats((prev) => {
      const existing = prev.find((c) => c.id === chatId);

      if (!existing) {
        const newChat: Chat = {
          id: chatId,
          title: makeTitle(cleanQuestion),
          service: selectedService,
          updatedAt: Date.now(),
          messages: [userMessage, assistantMessage],
        };

        return [newChat, ...prev];
      }

      const updated: Chat = {
        ...existing,
        service: selectedService,
        updatedAt: Date.now(),
        messages: [...existing.messages, userMessage, assistantMessage],
      };

      return [updated, ...prev.filter((c) => c.id !== chatId)];
    });

    await saveServerMessage({
      chatId,
      role: "user",
      content: cleanQuestion,
      service: selectedService,
      languageCode: selectedLanguage,
    });

    const conversationHistory = [
      ...(workingChat?.messages || [])
        .filter((message) => !message.isLoading)
        .map((message) => ({
          role: message.role,
          content: message.content,
          service: message.service,
          languageCode: message.languageCode,
        })),
      {
        role: "user",
        content: cleanQuestion,
        service: selectedService,
        languageCode: selectedLanguage,
      },
    ];

    try {
      const requestStartedAt = Date.now();

      const res = await fetch(selectedApi || "/api/astrology", {
        method: "POST",
        headers: {
          ...headers,
          "X-Bhagya-Skip-Persistence": "true",
        },
        body: JSON.stringify({
          chatId,
          service: selectedService,
          question: cleanQuestion,
          messages: conversationHistory,
          language: selectedLanguageLabel,
          languageCode: selectedLanguage,
        }),
      });

      if (res.status === 401) {
        localStorage.setItem(PENDING_QUESTION_KEY, cleanQuestion);
        router.push("/login?next=/");
        return;
      }

      const data = await res.json();

      if (res.status === 428 || data.code === "BIRTH_DETAILS_REQUIRED") {
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: chat.messages.filter(
                    (message) => message.id !== assistantMessageId
                  ),
                }
              : chat
          )
        );
        router.replace("/birth-details");
        return;
      }

      const finalAnswer = data.answer || t.silentError;
      const elapsed = Date.now() - requestStartedAt;
      const targetDelay = getRealisticReplyDelay(finalAnswer);
      const remainingDelay = Math.max(0, targetDelay - elapsed);

      await sleep(remainingDelay);

      updateAssistantMessage(chatId, assistantMessageId, finalAnswer);

      await saveServerMessage({
        chatId,
        role: "assistant",
        content: finalAnswer,
        service: selectedService,
        languageCode: selectedLanguage,
      });

      await loadUserChats();
    } catch {
      await sleep(1200);

      updateAssistantMessage(
        chatId,
        assistantMessageId,
        t.cosmicError
      );

      await saveServerMessage({
        chatId,
        role: "assistant",
        content: t.cosmicError,
        service: selectedService,
        languageCode: selectedLanguage,
      });
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePalmAnalyze(image: UploadedImage) {
    if (isCheckingAuth || isCheckingBirthProfile || isLoading) return;

    if (image.file.size <= 0) {
      setPalmAnalysisError({
        code: "IMAGE_REQUIRED",
        message: "Please upload a palm photo first.",
        image,
      });
      return;
    }

    if (!PALM_ALLOWED_IMAGE_TYPES.includes(image.file.type)) {
      setPalmAnalysisError({
        code: "UNSUPPORTED_IMAGE",
        message: "Please upload a JPG, PNG or WEBP image.",
        image,
      });
      return;
    }

    if (image.file.size > PALM_MAX_FILE_SIZE) {
      setPalmAnalysisError({
        code: "IMAGE_TOO_LARGE",
        message: "Please choose an image smaller than 20 MB.",
        image,
      });
      return;
    }

    if (!isLoggedIn) {
      router.push("/login?next=/");
      return;
    }

    if (!hasCompleteBirthProfile) {
      router.replace("/birth-details");
      return;
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
      setIsLoggedIn(false);
      router.push("/login?next=/");
      return;
    }

    const service: ServiceType = "palmistry";
    const cleanQuestion = PALM_UPLOAD_TEXT;
    const previewImageContent = makeImageMessageContent({
      image,
      imageUrl: image.dataUrl,
    });

    setPalmAnalysisError(null);
    setPalmVisualMap(null);
    palmVisualMapRequestRef.current += 1;
    setSelectedService(service);
    setPalmScanImageSource(image.storagePath ? image.dataUrl : image.previewUrl);
    setIsPalmScanReady(false);
    setPalmScanStatus(PALM_PREPARING_STATUS);
    setIsLoading(true);
    setIsPalmAnalyzing(true);

    let chatId = activeChatId;
    let workingChat = chatId
      ? chats.find((chat) => chat.id === chatId) || null
      : null;

    if (!chatId) {
      const newChat = await createServerChat({
        title: "Palmistry Reading",
        service,
        languageCode: selectedLanguage,
      });

      if (!newChat) {
        setIsLoading(false);
        setIsPalmAnalyzing(false);
        return;
      }

      chatId = newChat.id;
      workingChat = newChat;
      setActiveChatId(chatId);
      setChats((prev) => [newChat, ...prev]);
    }

    if (!chatId) {
      setIsLoading(false);
      setIsPalmAnalyzing(false);
      return;
    }

    const userMessageId = makeId();
    const assistantMessageId = makeId();

    const userMessage: Message = {
      id: userMessageId,
      role: "user",
      content: previewImageContent,
      service,
      languageCode: selectedLanguage,
    };

    const assistantMessage: Message = {
      id: assistantMessageId,
      role: "assistant",
      content: PALM_ANALYSIS_LOADING_TEXT,
      service,
      languageCode: selectedLanguage,
      isLoading: true,
    };

    setActiveChatId(chatId);

    setChats((prev) => {
      const existing = prev.find((c) => c.id === chatId);

      if (!existing) {
        const newChat: Chat = {
          id: chatId,
          title: "Palmistry Reading",
          service,
          updatedAt: Date.now(),
          messages: [userMessage, assistantMessage],
        };

        return [newChat, ...prev];
      }

      const updated: Chat = {
        ...existing,
        service,
        updatedAt: Date.now(),
        messages: [...existing.messages, userMessage, assistantMessage],
      };

      return [updated, ...prev.filter((c) => c.id !== chatId)];
    });

    const conversationHistory = [
      ...(workingChat?.messages || [])
        .filter((message) => !message.isLoading)
        .map((message) => ({
          role: message.role,
          content: message.content,
          service: message.service,
          languageCode: message.languageCode,
        })),
      {
        role: "user",
        content: PALM_UPLOAD_TEXT,
        service,
        languageCode: selectedLanguage,
      },
    ];

    let completedWithReading = false;
    let uploadedImage = image;

    try {
      uploadedImage = await uploadPalmImageForAnalysis({
        image,
        userId: session.user.id,
        chatId,
      });
      const visualMapPromise = uploadedImage.storagePath
        ? requestPalmVisualMap({
            token: session.access_token,
            storagePath: uploadedImage.storagePath,
            chatId,
          })
        : Promise.resolve(null);

      const responsePromise = fetch("/api/palmistry", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chatId,
          storagePath: uploadedImage.storagePath,
          fileName: uploadedImage.name,
          mimeType: uploadedImage.mimeType,
          fileSize: uploadedImage.size,
          question: cleanQuestion,
          service,
          language: selectedLanguageLabel,
          languageCode: selectedLanguage,
          messages: conversationHistory,
        }),
      });
      setPalmScanStatus(PALM_MAPPING_STATUS);

      const res = await responsePromise;
      const data = await res.json().catch(() => null);
      void visualMapPromise;

      if (res.status === 401) {
        router.push("/login?next=/");
        return;
      }

      if (!res.ok) {
        const message = getPalmAnalysisErrorMessage(data, res.status);

        setChats((prev) =>
          prev.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  messages: chat.messages.filter(
                    (messageItem) =>
                      messageItem.id !== assistantMessageId &&
                      messageItem.id !== userMessageId
                  ),
                }
              : chat
          )
        );
        setPalmAnalysisError({
          code: isRecord(data) && typeof data.code === "string" ? data.code : "",
          message,
          image: uploadedImage,
        });
        clearPalmScanImageSource();
        setIsPalmScanReady(false);
        return;
      }

      const finalAnswer =
        isRecord(data) && typeof data.answer === "string"
          ? data.answer
          : t.silentError;
      const imageMessage = isRecord(data) && isRecord(data.imageMessage)
        ? data.imageMessage
        : null;
      const displayImageContent =
        imageMessage && typeof imageMessage.content === "string"
          ? imageMessage.content
          : previewImageContent;

      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: chat.messages.map((messageItem) =>
                  messageItem.id === userMessageId
                    ? { ...messageItem, content: displayImageContent }
                    : messageItem
                ),
              }
            : chat
        )
      );

      updateAssistantMessage(chatId, assistantMessageId, finalAnswer);
      setPalmImage(null);
      setPalmAnalysisError(null);

      await loadUserChats();
      completedWithReading = true;
      setIsPalmScanReady(true);
    } catch (error) {
      await sleep(1200);

      console.error("Palmistry analysis request failed:", error);
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: chat.messages.filter(
                  (messageItem) =>
                    messageItem.id !== assistantMessageId &&
                    messageItem.id !== userMessageId
                ),
              }
            : chat
        )
      );
      setPalmAnalysisError({
        code:
          error instanceof Error &&
          (error.message === "PALM_PREPARATION_FAILED" ||
            error.message === "PALM_UPLOAD_FAILED")
            ? error.message
            : "PALM_ANALYSIS_FAILED",
        message:
          error instanceof Error && error.message === "PALM_PREPARATION_FAILED"
            ? "This photo is too large to process. Please choose a slightly smaller image."
            : error instanceof Error && error.message === "PALM_UPLOAD_FAILED"
            ? "Your palm photo could not be uploaded. Please check your connection and try again."
            : "Bhagya could not analyse this palm photo right now. Please try again.",
        image: uploadedImage,
      });
      clearPalmScanImageSource();
      setIsPalmScanReady(false);
    } finally {
      setIsLoading(false);
      if (!completedWithReading) {
        setIsPalmAnalyzing(false);
        clearPalmScanImageSource();
        setIsPalmScanReady(false);
        setPalmScanStatus(PALM_MAPPING_STATUS);
      }
    }
  }

  async function selectChat(chat: Chat) {
    setActiveChatId(chat.id);
    setSelectedService(chat.service);
    setQuestion("");
    setPalmImage(null);
    setPalmAnalysisError(null);
    clearPalmScanImageSource();
    setIsPalmScanReady(false);
    setPalmVisualMap(null);
    setIsSidebarOpen(false);

    const headers = await getAuthHeaders();

    if (!headers) return;

    try {
      const res = await fetch(`/api/chats/${chat.id}/messages`, {
        method: "GET",
        headers,
      });

      if (!res.ok) return;

      const data = (await res.json()) as { messages?: unknown[] };
      const loadedMessages: Message[] = (Array.isArray(data.messages)
        ? data.messages
        : []
      )
        .filter((message): message is Record<string, unknown> =>
          Boolean(
            message && typeof message === "object" && !Array.isArray(message)
          )
        )
        .map((message) => mapDbMessage(message, chat.service));

      setChats((prev) =>
        prev.map((item) =>
          item.id === chat.id ? { ...item, messages: loadedMessages } : item
        )
      );
    } catch {
      console.error("Could not load messages");
    }
  }

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#020817] text-white">
      {/* ── Mandala background ── */}
      <div
        className={`pointer-events-none fixed inset-0 z-0 overflow-hidden ${
          showMobileLanding ? "hidden min-[600px]:block" : ""
        }`}
      >
        <div className="bhagya-mandala-stage absolute left-1/2">
          {/* Outer orbit */}
          <div
            className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-400/10"
            style={{
              width: "min(118vw, 900px)",
              animation: "spinCCW 280s linear infinite",
            }}
          />

          {/* Middle orbit */}
          <div
            className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-400/10"
            style={{
              width: "min(102vw, 660px)",
              animation: "spinCW 200s linear infinite",
            }}
          />

          {/* Main mandala image */}
          <div
            className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-contain bg-center bg-no-repeat opacity-[0.20] mix-blend-screen"
            style={{
              width: "min(92vw, 720px)",
              backgroundImage: "url('/mandala.png')",
              animation: "spinCW 180s linear infinite",
              filter: "hue-rotate(185deg) saturate(1.6) brightness(1.15)",
            }}
          />

          {/* Central glow */}
          <div
            className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: "min(68vw, 520px)",
              background:
                "radial-gradient(circle, rgba(56,189,248,0.08) 0%, transparent 70%)",
            }}
          />
        </div>
      </div>

      {/* ── Subtle star field only, no floating constellations ── */}
      <StarField
        className={showMobileLanding ? "hidden min-[600px]:block" : ""}
      />

      {/* ── Subtle vignette overlay ── */}
      <div
        className={`pointer-events-none absolute inset-0 z-0 ${
          showMobileLanding ? "hidden min-[600px]:block" : ""
        }`}
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(2,8,23,0.72) 100%)",
        }}
      />

      {/* ── Shared recent chats drawer ── */}
      <div
        className={`fixed inset-0 z-40 ${
          isSidebarOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        {/* Scrim */}
        <button
          onClick={() => setIsSidebarOpen(false)}
          className={`absolute inset-0 transition-opacity duration-300 ${
            isSidebarOpen ? "opacity-100" : "opacity-0"
          }`}
          style={{ background: "rgba(2,8,23,0.74)" }}
          aria-label={t.closeDrawer}
        />

        {/* Drawer panel */}
        <aside
          className={`absolute left-0 top-0 flex h-full w-[88vw] max-w-[340px] flex-col border-r border-white/[0.08] backdrop-blur-3xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{
            background:
              "linear-gradient(180deg, rgba(2,8,23,0.98) 0%, rgba(3,7,18,0.98) 100%)",
          }}
        >
          {/* Drawer header */}
          <div className="flex items-center justify-between border-b border-white/[0.07] px-4 pb-4 pt-5">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-xl"
                style={{
                  background: "linear-gradient(135deg, #38bdf8, #1d4ed8)",
                }}
              >
                <span className="text-sm">✨</span>
              </div>

              <div>
                <p className="text-[14px] font-semibold leading-none tracking-tight">
                  {t.appName}
                </p>
                <p className="mt-0.5 text-[10px] text-sky-300/70">
                  {t.tagline}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsSidebarOpen(false)}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* New reading button */}
          <div className="px-3 pb-2 pt-3">
            <button
              onClick={() => {
                startNewChat();
                setIsSidebarOpen(false);
              }}
              className="flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-left text-[13px] font-medium text-white/60 transition hover:border-sky-500/35 hover:bg-sky-500/10 hover:text-sky-100"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/[0.08] text-white/50">
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              {t.newReading}
            </button>
          </div>

          {/* Section label */}
          <p className="px-5 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/25">
            {t.recent}
          </p>

          {/* Chat list */}
          <div className="scrollbar-hide flex-1 space-y-1 overflow-y-auto px-3 pb-6">
            {!isLoadingChats && chats.length === 0 && (
              <p className="px-2 pt-4 text-center text-[12px] text-white/25">
                {t.noReadingsYet}
              </p>
            )}

            {chats.map((chat) => {
              const isActive = activeChatId === chat.id;

              return (
                <button
                  key={chat.id}
                  onClick={() => {
                    void selectChat(chat);
                  }}
                  className={`group w-full rounded-xl px-3 py-2.5 text-left transition ${
                    isActive
                      ? "bg-sky-500/15 ring-1 ring-sky-500/30"
                      : "hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span
                      className={`mt-0.5 flex-shrink-0 text-[13px] ${
                        isActive
                          ? "text-sky-300"
                          : "text-white/30 group-hover:text-white/50"
                      }`}
                    >
                      {getServiceGlyph(chat.service)}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`truncate text-[13px] font-medium leading-snug ${
                          isActive
                            ? "text-cyan-100"
                            : "text-white/65 group-hover:text-white/80"
                        }`}
                      >
                        {chat.title}
                      </p>

                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span
                          className={`text-[10px] capitalize ${
                            isActive ? "text-sky-300/70" : "text-white/25"
                          }`}
                        >
                          {getServiceLabel(chat.service)}
                        </span>
                        <span className="text-[10px] text-white/15">·</span>
                        <span className="text-[10px] text-white/25">
                          {timeAgo(chat.updatedAt, t.timeAgo)}
                        </span>
                      </div>
                    </div>

                    {isActive && (
                      <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-300" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>
      </div>

      {isPreparingBirthProfile && (
        <div className="relative z-10 flex min-h-[100svh] items-center justify-center px-4 text-center">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.05] px-5 py-4 text-[15px] text-white/65 backdrop-blur-2xl">
            Preparing your Bhagya profile...
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          LANDING / FIRST SCREEN
      ══════════════════════════════════════════ */}
      {!hasStarted && !isPreparingBirthProfile && !isLoggedIn && (
        <div className="block min-[600px]:hidden">
          <UniversalMobileLanding
            question={question}
            setQuestion={setQuestion}
            handleAsk={handleAsk}
            isLoading={isLoading || isCheckingAuth}
            inputRef={inputRef}
            selectedService={selectedService}
            setSelectedService={setSelectedService}
            selectedLanguage={selectedLanguage}
            setSelectedLanguage={setSelectedLanguage}
            palmImage={palmImage}
            onPalmImageChange={handlePalmImageChange}
            handlePalmAnalyze={handlePalmAnalyze}
            isPalmAnalyzing={isPalmAnalyzing}
            t={t}
          />
        </div>
      )}

      {!hasStarted && !isPreparingBirthProfile && (
        <div
          className={`bhagya-landing relative z-10 min-h-[100svh] flex-col overflow-hidden ${
            !isLoggedIn ? "hidden min-[600px]:flex" : "flex"
          }`}
        >
          {chats.length > 0 && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="fixed left-4 top-24 z-30 flex h-10 w-10 items-center justify-center rounded-2xl border border-white/[0.08] bg-black/45 text-white/50 backdrop-blur-2xl transition hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-sky-300"
              aria-label={t.recent}
              title={t.recent}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="16" y2="12" />
                <line x1="3" y1="18" x2="19" y2="18" />
              </svg>
            </button>
          )}

          {/* Header */}
          <header className="flex w-full items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+16px)] sm:px-8 sm:py-5">
            <Link href="/" className="group flex items-center gap-2.5">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg shadow-sky-500/20 transition group-hover:scale-105 sm:h-9 sm:w-9"
                style={{
                  background: "linear-gradient(135deg, #38bdf8, #1d4ed8)",
                }}
              >
                <span className="text-base">✨</span>
              </div>

              <div>
                <p className="text-[17px] font-semibold leading-none tracking-tight sm:text-[15px]">
                  {t.appName}
                </p>
                <p className="mt-0.5 text-[12px] leading-none text-sky-300/70 sm:text-[11px]">
                  {t.tagline}
                </p>
              </div>
            </Link>

            <div className="bhagya-landing-actions flex items-center gap-2">
              <LanguageSelector
                selectedLanguage={selectedLanguage}
                setSelectedLanguage={setSelectedLanguage}
              />

              {isLoggedIn ? (
                <button
                  onClick={logoutUser}
                  className="bhagya-pill-btn min-h-[44px] text-[14px] font-medium text-white/70 transition hover:text-sky-300 sm:min-h-0 sm:text-[13px]"
                >
                  {t.logout}
                </button>
              ) : (
                <Link
                  href="/login"
                  className="bhagya-pill-btn flex min-h-[44px] items-center text-[14px] font-medium text-white/70 transition hover:text-sky-300 sm:min-h-0 sm:text-[13px]"
                >
                  {t.signIn}
                </Link>
              )}
            </div>
          </header>

          {/* Hero */}
          <section className="flex flex-1 flex-col items-center justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-4 sm:px-5 sm:pb-20">
            <div className="w-full max-w-[560px]">
              {/* Badge */}
              <div className="mb-[22px] flex justify-center">
                <span className="inline-flex max-w-[calc(100vw-32px)] items-center justify-center gap-2 rounded-full border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-center text-[13px] font-medium text-sky-300/80 backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-300" />
                  {t.badge}
                </span>
              </div>

              {selectedService === "palmistry" ? (
                <ImageUploader
                  mode="palmistry"
                  accept="image/*"
                  maxSize={20}
                  allowCamera
                  value={palmImage}
                  onChange={handlePalmImageChange}
                  onAnalyze={handlePalmAnalyze}
                  isAnalyzing={isPalmAnalyzing}
                  disabled={isLoading || isCheckingAuth}
                />
              ) : (
                <>
                  {/* Headline */}
                  <div className="mb-7 text-center">
                    <h1 className="mb-4 text-center text-[36px] font-semibold leading-[1.12] tracking-[-0.03em] text-white/95 sm:text-[38px] md:text-[42px]">
                      {t.headlineLine1}
                      <br />
                      <span className="text-sky-300">{t.headlineLine2}</span>
                    </h1>
                    <p className="mx-auto max-w-[330px] text-center text-[15px] leading-6 text-white/50 sm:text-base">
                      {t.subtitle}
                    </p>
                  </div>

                  {/* Input */}
                  <ChatInput
                    question={question}
                    setQuestion={setQuestion}
                    handleAsk={handleAsk}
                    isLoading={isLoading || isCheckingAuth}
                    inputRef={inputRef}
                    placeholder={t.inputPlaceholder}
                    askLabel={t.ask}
                    attachLabel={t.attach}
                  />
                </>
              )}

              {/* Service tabs */}
              <ServiceTabs
                selectedService={selectedService}
                setSelectedService={setSelectedService}
                serviceLabels={t.services}
              />
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════
          CHAT SCREEN
      ══════════════════════════════════════════ */}
      {hasStarted && !isPreparingBirthProfile && (
        <div className="relative z-10 flex h-[100dvh] min-h-0 overflow-hidden">
          {/* ── Left icon rail ── */}
          <nav className="fixed left-0 top-0 z-30 hidden h-screen w-14 flex-col items-center border-r border-white/[0.07] bg-black/50 py-3 backdrop-blur-2xl sm:flex">
            {/* Logo mark */}
            <Link
              href="/"
              className="mb-4 flex h-9 w-9 items-center justify-center rounded-2xl transition hover:scale-105"
              style={{
                background: "linear-gradient(135deg, #38bdf8, #1d4ed8)",
              }}
            >
              <span className="text-sm">✨</span>
            </Link>

            {/* Divider */}
            <div className="mb-3 h-px w-8 bg-white/10" />

            {/* Open drawer */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="bhagya-rail-btn group mb-2"
              aria-label={t.recentReadings}
              title={t.recentReadings}
            >
              <RailIcon>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="16" y2="12" />
                  <line x1="3" y1="18" x2="19" y2="18" />
                </svg>
              </RailIcon>
            </button>

            {/* New chat */}
            <button
              onClick={startNewChat}
              className="bhagya-rail-btn group"
              aria-label={t.newReading}
              title={t.newReading}
            >
              <RailIcon>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </RailIcon>
            </button>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Service glyphs */}
            <div className="mb-3 space-y-1">
              {services.map((svc) => (
                <button
                  key={svc.id}
                  onClick={() => setSelectedService(svc.id)}
                  className={`flex h-9 w-9 items-center justify-center rounded-xl text-sm transition ${
                    selectedService === svc.id
                      ? "bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40"
                      : "text-white/30 hover:bg-white/[0.08] hover:text-white/60"
                  }`}
                  title={t.services[svc.id]}
                >
                  {svc.glyph}
                </button>
              ))}
            </div>
          </nav>

          {/* ── Main chat area ── */}
          <section className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden pl-0 sm:pl-14">
            {/* Chat header */}
            <header className="fixed left-0 right-0 top-0 z-20 flex h-[calc(56px+env(safe-area-inset-top))] items-end justify-between border-b border-white/[0.07] bg-[#020817]/75 px-3 pb-2 pt-[env(safe-area-inset-top)] backdrop-blur-2xl sm:left-14 sm:h-14 sm:items-center sm:px-4 sm:py-0">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/60 transition hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-sky-300 sm:hidden"
                  aria-label={t.recentReadings}
                  title={t.recentReadings}
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="12" x2="16" y2="12" />
                    <line x1="3" y1="18" x2="19" y2="18" />
                  </svg>
                </button>

                <button
                  onClick={startNewChat}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-white/60 transition hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-sky-300 sm:hidden"
                  aria-label={t.newReading}
                  title={t.newReading}
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-lg text-sm ${
                    selectedService === "astrology"
                      ? "bg-sky-500/15 text-sky-300"
                      : selectedService === "numerology"
                      ? "bg-cyan-500/15 text-cyan-300"
                      : selectedService === "tarot"
                      ? "bg-indigo-500/15 text-indigo-300"
                      : "bg-blue-500/15 text-blue-300"
                  }`}
                >
                  {getServiceGlyph(selectedService)}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold leading-none text-white/90">
                    {getServiceLabel(selectedService)} {t.reading}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-none text-white/35">
                    {t.appName}
                  </p>
                </div>
              </div>

              <div className="bhagya-chat-actions flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
                <LanguageSelector
                  selectedLanguage={selectedLanguage}
                  setSelectedLanguage={setSelectedLanguage}
                />

                {isLoggedIn ? (
                  <button
                    onClick={logoutUser}
                    className="bhagya-pill-btn text-[12px] text-white/60 transition hover:text-sky-300"
                  >
                    {t.logout}
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="bhagya-pill-btn text-[12px] text-white/60 transition hover:text-sky-300"
                  >
                    {t.signIn}
                  </Link>
                )}
              </div>
            </header>

            {/* Messages */}
            <div
              ref={messagesScrollRef}
              onScroll={(event) => {
                const target = event.currentTarget;
                const distanceFromBottom =
                  target.scrollHeight - target.scrollTop - target.clientHeight;

                shouldStickToBottomRef.current = distanceFromBottom < 96;
              }}
              className="min-h-0 flex-1 overscroll-contain overflow-y-auto pb-[190px] pt-[calc(56px+env(safe-area-inset-top))] sm:pb-44 sm:pt-14"
              style={{
                WebkitOverflowScrolling: "touch",
              }}
            >
              <div
                className="mx-auto max-w-2xl space-y-4 px-[14px] py-4 sm:space-y-5 sm:px-4 sm:py-6"
                style={{
                  animation: "slideUp 0.4s cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                {activeChat?.messages.map((message, idx) => (
                  <div
                    key={message.id}
                    className={`flex gap-3 ${
                      message.role === "user"
                        ? "justify-end"
                        : "justify-start"
                    }`}
                    style={{
                      animation: `slideUp 0.35s cubic-bezier(0.16,1,0.3,1) ${
                        idx * 0.04
                      }s both`,
                    }}
                  >
                    {/* Assistant avatar */}
                    {message.role === "assistant" && (
                      <div className="mt-1 flex-shrink-0">
                        <div
                          className="flex h-7 w-7 items-center justify-center rounded-full text-xs"
                          style={{
                            background:
                              "linear-gradient(135deg, rgba(56,189,248,0.24), rgba(29,78,216,0.22))",
                            border: "1px solid rgba(56,189,248,0.22)",
                          }}
                        >
                          {getServiceGlyph(message.service)}
                        </div>
                      </div>
                    )}

                    {/* Bubble */}
                    <div
                      className={`${
                        message.role === "user"
                          ? "max-w-[88%] sm:max-w-[65%]"
                          : "max-w-[92%] sm:max-w-[72%]"
                      }`}
                    >
                      {message.role === "assistant" && (
                        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-sky-300/60">
                          {getServiceLabel(message.service)}
                        </p>
                      )}

                      <div
                        className={`rounded-2xl ${
                          parseMessageContent(message.content).imageUrl
                            ? "p-2"
                            : "px-4 py-3"
                        } text-[15px] leading-6 sm:text-[15px] ${
                          message.role === "user"
                            ? "text-white"
                            : "border border-white/[0.08] text-white/82"
                        }`}
                        style={
                          message.role === "user"
                            ? {
                                background:
                                  "linear-gradient(135deg, #38bdf8, #1d4ed8)",
                                boxShadow:
                                  "0 4px 24px rgba(56,189,248,0.18)",
                              }
                            : {
                                background: "rgba(255,255,255,0.04)",
                                backdropFilter: "blur(12px)",
                              }
                        }
                      >
                        {message.isLoading ? (
                          <div className="flex items-center gap-2 text-white/40">
                            <LoadingDots />
                            <span className="text-[13px]">
                              {t.consulting}
                            </span>
                          </div>
                        ) : (
                          <MessageContent message={message} />
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {palmAnalysisError && selectedService === "palmistry" && (
                  <PalmAnalysisErrorCard
                    message={palmAnalysisError.message}
                    onRetry={() => handlePalmAnalyze(palmAnalysisError.image)}
                    onReplace={() => {
                      void cleanupUnsavedPalmImage(palmAnalysisError.image);
                      setPalmImage(null);
                      setPalmAnalysisError(null);
                    }}
                    isLoading={isLoading || isPalmAnalyzing}
                  />
                )}

                <div ref={bottomRef} />
              </div>
            </div>

            {/* ── Bottom composer ── */}
            <div
              className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/[0.07] backdrop-blur-2xl sm:left-14"
              style={{
                background: "rgba(2,8,23,0.94)",
                paddingBottom: "env(safe-area-inset-bottom)",
              }}
            >
              {/* Service mode pills */}
              <div className="mx-auto max-w-2xl px-3 pt-3">
                <ServiceTabs
                  selectedService={selectedService}
                  setSelectedService={setSelectedService}
                  serviceLabels={t.services}
                  compact
                />
              </div>

              {/* Input bar */}
              <div className="mx-auto max-w-2xl px-3 pb-3 pt-2.5 sm:pb-4">
                {selectedService === "palmistry" &&
                (!activeChatHasPalmImage || palmAnalysisError || palmImage) ? (
                  <ImageUploader
                    mode="palmistry"
                    accept="image/*"
                    maxSize={20}
                    allowCamera
                    value={palmImage}
                    onChange={handlePalmImageChange}
                    onAnalyze={handlePalmAnalyze}
                    isAnalyzing={isPalmAnalyzing}
                    disabled={isLoading || isCheckingAuth}
                  />
                ) : (
                  <ChatInput
                    question={question}
                    setQuestion={setQuestion}
                    handleAsk={handleAsk}
                    isLoading={isLoading || isCheckingAuth}
                    inputRef={inputRef}
                    placeholder={t.followupPlaceholder}
                    askLabel={t.ask}
                    attachLabel={t.attach}
                  />
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* ── Global styles & keyframes ── */}
      {isPalmAnalyzing && palmScanImageUrl && (
        <PalmScanAnimation
          imageUrl={palmScanImageUrl}
          isComplete={isPalmScanReady}
          status={palmScanStatus}
          visualMap={palmVisualMap}
          onAnimationFinished={() => {
            setIsPalmAnalyzing(false);
            setIsPalmScanReady(false);
            clearPalmScanImageSource();
            setPalmScanStatus(PALM_MAPPING_STATUS);
          }}
        />
      )}

      <style>{`
        @keyframes spinCW {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        @keyframes spinCCW {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.25; transform: translateY(0); }
          50%       { opacity: 1;    transform: translateY(-2px); }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .bhagya-pill-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 100px;
          border: 1px solid rgba(255,255,255,0.09);
          background: rgba(255,255,255,0.04);
          padding: 8px 14px;
          backdrop-filter: blur(8px);
          transition: border-color 0.2s, color 0.2s, background 0.2s;
        }

        .bhagya-pill-btn:hover {
          border-color: rgba(125,211,252,0.45);
          background: rgba(56,189,248,0.08);
        }

        .bhagya-rail-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 36px;
          width: 36px;
          border-radius: 10px;
          color: rgba(255,255,255,0.4);
          transition: background 0.18s, color 0.18s, transform 0.15s;
        }

        .bhagya-rail-btn:hover {
          background: rgba(56,189,248,0.16);
          color: rgba(125,211,252,0.95);
          transform: scale(1.05);
        }

        .bhagya-rail-btn:active {
          transform: scale(0.96);
        }

        @media (max-width: 639px) {
          .bhagya-landing-actions button,
          .bhagya-landing-actions .bhagya-pill-btn {
            min-height: 44px;
            font-size: 14px;
            padding-left: 14px;
            padding-right: 14px;
          }
        }

        .bhagya-chat-actions button,
        .bhagya-chat-actions .bhagya-pill-btn {
          min-height: 40px;
        }

        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }

        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </main>
  );
}

/* ── Rail icon wrapper ── */
function MessageContent({ message }: { message: Message }) {
  const parsed = parseMessageContent(message.content);

  if (parsed.imageUrl) {
    return (
      <div className="w-[220px] max-w-[70vw] sm:w-[280px]">
        <div className="overflow-hidden rounded-xl bg-black/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={parsed.imageUrl}
            alt={parsed.imageName || "Uploaded palm image"}
            className="max-h-[330px] w-full object-cover"
          />
        </div>
        {parsed.text && (
          <p className="px-1.5 pb-1 pt-2 text-[12px] leading-5 text-white/82">
            {parsed.text}
          </p>
        )}
      </div>
    );
  }

  return <p className="whitespace-pre-wrap">{message.content}</p>;
}

function PalmAnalysisErrorCard({
  message,
  onRetry,
  onReplace,
  isLoading,
}: {
  message: string;
  onRetry: () => void;
  onReplace: () => void;
  isLoading: boolean;
}) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-[14px] leading-6 text-rose-50/90 sm:max-w-[72%]">
        <p>{message}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRetry}
            disabled={isLoading}
            className="rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Retry Analysis
          </button>
          <button
            type="button"
            onClick={onReplace}
            disabled={isLoading}
            className="rounded-full border border-white/10 px-3 py-1.5 text-[12px] font-semibold text-white/70 transition hover:border-sky-300/35 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Replace Photo
          </button>
        </div>
      </div>
    </div>
  );
}

function UniversalMobileLanding({
  question,
  setQuestion,
  handleAsk,
  isLoading,
  inputRef,
  selectedService,
  setSelectedService,
  selectedLanguage,
  setSelectedLanguage,
  palmImage,
  onPalmImageChange,
  handlePalmAnalyze,
  isPalmAnalyzing,
  t,
}: {
  question: string;
  setQuestion: (value: string) => void;
  handleAsk: () => void;
  isLoading: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  selectedService: ServiceType;
  setSelectedService: (service: ServiceType) => void;
  selectedLanguage: LanguageCode;
  setSelectedLanguage: (language: LanguageCode) => void;
  palmImage: UploadedImage | null;
  onPalmImageChange: (image: UploadedImage | null) => void;
  handlePalmAnalyze: (image: UploadedImage) => void;
  isPalmAnalyzing: boolean;
  t: UiText;
}) {
  const isEnglish = selectedLanguage === "english";
  const badge = isEnglish
    ? "Astrology \u00b7 Numerology \u00b7 Tarot \u00b7 Palmistry"
    : t.badge;
  const inputPlaceholder = isEnglish
    ? "Ask about career, love, marriage, kundli\u2026"
    : t.inputPlaceholder;

  return (
    <div className="bhagya-mobile-landing">
      <MobileLandingBackground />

      <header className="bhagya-mobile-header">
        <Link href="/" className="bhagya-mobile-brand">
          <div className="bhagya-mobile-logo">
            <span className="text-lg">*</span>
          </div>

          <div className="min-w-0">
            <p className="bhagya-mobile-brand-title">{t.appName}</p>
            <p className="bhagya-mobile-brand-subtitle">{t.tagline}</p>
          </div>
        </Link>

        <div className="bhagya-mobile-actions">
          <div className="bhagya-mobile-language">
            <LanguageSelector
              selectedLanguage={selectedLanguage}
              setSelectedLanguage={setSelectedLanguage}
            />
          </div>

          <Link href="/login" className="bhagya-mobile-signin">
            {t.signIn}
          </Link>
        </div>
      </header>

      <main className="bhagya-mobile-main">
        <section className="bhagya-mobile-hero">
          <div className="bhagya-mobile-badge">
            <span className="bhagya-mobile-badge-dot" />
            {badge}
          </div>

          <h1
            className={`bhagya-mobile-title ${
              isEnglish ? "" : "bhagya-mobile-title-translated"
            }`}
          >
            <span className={isEnglish ? "block whitespace-nowrap" : "block"}>
              {t.headlineLine1}
            </span>
            <span
              className={
                isEnglish
                  ? "block whitespace-nowrap text-sky-300"
                  : "block text-sky-300"
              }
            >
              {t.headlineLine2}
            </span>
          </h1>

          {selectedService === "palmistry" ? (
            <div className="mt-6">
              <ImageUploader
                mode="palmistry"
                accept="image/*"
                maxSize={20}
                allowCamera
                value={palmImage}
                onChange={onPalmImageChange}
                onAnalyze={handlePalmAnalyze}
                isAnalyzing={isPalmAnalyzing}
                disabled={isLoading}
              />
            </div>
          ) : (
            <>
              <p className="bhagya-mobile-subtitle">{t.subtitle}</p>

              <div className="bhagya-mobile-input">
                <button
                  type="button"
                  className="bhagya-mobile-plus"
                  aria-label={t.attach}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>

                <input
                  ref={inputRef}
                  type="text"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) handleAsk();
                  }}
                  placeholder={inputPlaceholder}
                  className="bhagya-mobile-input-field"
                />

                <button
                  type="button"
                  onClick={handleAsk}
                  disabled={isLoading}
                  className="bhagya-mobile-ask disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {isLoading ? <LoadingDots /> : t.ask}
                </button>
              </div>
            </>
          )}

          <div className="bhagya-mobile-services">
            {services.map((service) => {
              const active = selectedService === service.id;

              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => setSelectedService(service.id)}
                  className={`bhagya-mobile-service-button ${
                    active ? "bhagya-mobile-service-active" : ""
                  }`}
                >
                  <span>{service.glyph}</span>
                  {t.services[service.id]}
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

function MobileLandingBackground() {
  return (
    <>
      <StarField />

      <div className="bhagya-mobile-mandala-stage" aria-hidden="true">
        <div className="bhagya-mobile-orbit bhagya-mobile-orbit-outer" />
        <div className="bhagya-mobile-orbit bhagya-mobile-orbit-inner" />
        <div className="bhagya-mobile-mandala-shell">
          <div className="bhagya-mobile-mandala-image" />
        </div>
        <div className="bhagya-mobile-mandala-glow" />
      </div>

      <div
        className="pointer-events-none absolute inset-0 z-[2]"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(2,8,23,0.72) 100%)",
        }}
      />
    </>
  );
}

function RailIcon({ children }: { children: ReactNode }) {
  return <span className="flex items-center justify-center">{children}</span>;
}

/* ── Chat input composer ── */
function ChatInput({
  question,
  setQuestion,
  handleAsk,
  isLoading,
  inputRef,
  placeholder,
  askLabel,
  attachLabel,
}: {
  question: string;
  setQuestion: (v: string) => void;
  handleAsk: () => void;
  isLoading: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  placeholder: string;
  askLabel: string;
  attachLabel: string;
}) {
  return (
    <div
      className="flex min-h-[64px] w-full items-center gap-2 rounded-[20px] px-3 py-2.5 transition-all duration-200 focus-within:ring-1 focus-within:ring-sky-400/40 sm:min-h-[60px] sm:rounded-2xl"
      style={{
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
      }}
    >
      <button
        type="button"
        className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-white/35 transition hover:bg-white/[0.08] hover:text-white/60 sm:h-9 sm:w-9"
        aria-label={attachLabel}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      <input
        ref={inputRef}
        type="text"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAsk()}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[16px] leading-6 text-white outline-none placeholder:text-white/35 sm:text-[15px]"
      />

      <button
        onClick={handleAsk}
        disabled={isLoading}
        className={`flex min-h-[46px] min-w-[92px] flex-shrink-0 items-center justify-center rounded-xl px-4 text-[15px] font-semibold text-white transition-all duration-150 disabled:cursor-not-allowed sm:min-w-[88px] ${
          question.trim() ? "opacity-100 active:scale-95" : "opacity-50"
        }`}
        style={{
          background: isLoading
            ? "rgba(29,78,216,0.55)"
            : "linear-gradient(135deg, #38bdf8, #1d4ed8)",
          boxShadow: question.trim()
            ? "0 2px 16px rgba(56,189,248,0.25)"
            : "none",
        }}
      >
        {isLoading ? (
          <span className="flex items-center gap-1.5">
            <LoadingDots />
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            {askLabel}
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </span>
        )}
      </button>
    </div>
  );
}

/* ── Service mode tabs ── */
function ServiceTabs({
  selectedService,
  setSelectedService,
  serviceLabels,
  compact = false,
}: {
  selectedService: ServiceType;
  setSelectedService: (s: ServiceType) => void;
  serviceLabels: Record<ServiceType, string>;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "scrollbar-hide flex items-center gap-2 overflow-x-auto"
          : "mt-4 grid w-full grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-center"
      }
    >
      {services.map((svc) => {
        const active = selectedService === svc.id;

        return (
          <button
            key={svc.id}
            onClick={() => setSelectedService(svc.id)}
            className={`flex items-center gap-1.5 rounded-full border font-medium transition-all duration-150 active:scale-95 ${
              compact
                ? "min-h-10 flex-shrink-0 whitespace-nowrap px-3 text-[13px]"
                : "min-h-12 w-full justify-center px-3 text-[14px] sm:w-auto"
            } ${
              active
                ? "border-sky-500/50 text-sky-300"
                : "border-white/[0.08] text-white/45 hover:border-sky-400/35 hover:text-white/70"
            }`}
            style={
              active
                ? { background: "rgba(56,189,248,0.12)" }
                : { background: "rgba(255,255,255,0.03)" }
            }
          >
            <span className={compact ? "text-[13px]" : "text-[15px]"}>
              {svc.glyph}
            </span>
            {serviceLabels[svc.id]}
          </button>
        );
      })}
    </div>
  );
}

/* ── Subtle star field only: no floating constellations ── */
const BG_STARS = Array.from({ length: 140 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: Math.random() * 0.5 + 0.3,
  speed: Math.random() * 3000 + 1800,
  offset: Math.random() * Math.PI * 2,
}));

function StarField({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvasEl = canvasRef.current;

    if (canvasEl === null) return;

    const context = canvasEl.getContext("2d");

    if (context === null) return;

    const canvas: HTMLCanvasElement = canvasEl;
    const ctx: CanvasRenderingContext2D = context;

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight || window.innerHeight;
    }

    resize();
    window.addEventListener("resize", resize);

    function draw() {
      const W = canvas.width;
      const H = canvas.height;
      const now = Date.now();

      ctx.clearRect(0, 0, W, H);

      BG_STARS.forEach((star) => {
        const alpha =
          0.18 +
          0.28 *
            (0.5 +
              0.5 * Math.sin((now / star.speed) * Math.PI * 2 + star.offset));

        const x = star.x * W;
        const y = star.y * H;

        ctx.beginPath();
        ctx.arc(x, y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(220, 240, 255, ${alpha})`;
        ctx.fill();
      });

      frameRef.current = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 z-0 h-full w-full ${className}`}
    />
  );
}

/* ── Loading dots ── */
function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[0, 0.18, 0.36].map((delay, i) => (
        <span
          key={i}
          className="inline-block h-[5px] w-[5px] rounded-full bg-current"
          style={{ animation: `pulse 1.1s ease-in-out ${delay}s infinite` }}
        />
      ))}
    </span>
  );
}
