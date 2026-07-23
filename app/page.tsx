"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
  type ReactNode,
  type RefObject,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import ImageUploader, { type UploadedImage } from "@/components/ImageUploader";
import LanguageSelector from "@/components/LanguageSelector";
import PalmScanAnimation from "@/components/PalmScanAnimation";
import NumerologyBlueprint from "@/components/NumerologyBlueprint";
import BhagyaLogo from "@/components/branding/BhagyaLogo";
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
import { parseNumerologyBlueprint } from "@/lib/numerology/messages";
import type {
  DrawnTarotCard,
  TarotReadingSummary,
  TarotSpreadType,
} from "@/lib/tarot/reading";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useSettingsProfile } from "@/components/providers/SettingsProfileProvider";
import TopNavigation from "@/components/navigation/TopNavigation";

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

type TarotReadingMessagePayload = TarotReadingSummary & {
  type: "bhagya.tarot";
  service: "tarot";
};

type TarotSessionState = {
  id: string;
  spreadType: TarotSpreadType;
  spreadName: string;
  selectionCount: number;
  availablePositions: number[];
  spreadPositions: string[];
};

type TarotFlowStatus =
  | "idle"
  | "asking"
  | "shuffling"
  | "selecting"
  | "revealing"
  | "complete";

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
  exists?: boolean;
  complete?: boolean;
  code?: string;
};

const PENDING_QUESTION_KEY = "bhagya_pending_question_v1";
const verifiedBirthProfileUsers = new Set<string>();
const IMAGE_MESSAGE_TYPE = "bhagya.image";
const TAROT_MESSAGE_TYPE = "bhagya.tarot";
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

function isTarotReadingPayload(
  value: unknown
): value is TarotReadingMessagePayload {
  return (
    isRecord(value) &&
    value.type === TAROT_MESSAGE_TYPE &&
    value.service === "tarot" &&
    typeof value.readingId === "string" &&
    typeof value.question === "string" &&
    (value.spreadType === "one-card" || value.spreadType === "three-card") &&
    typeof value.spreadName === "string" &&
    Array.isArray(value.cards) &&
    value.cards.every(
      (card) =>
        isRecord(card) &&
        typeof card.cardId === "string" &&
        typeof card.name === "string" &&
        typeof card.position === "string" &&
        (card.orientation === "upright" || card.orientation === "reversed") &&
        typeof card.shortMeaning === "string" &&
        Array.isArray(card.keywords)
    ) &&
    typeof value.interpretation === "string"
  );
}

function parseTarotReadingContent(
  content: string
): TarotReadingMessagePayload | null {
  if (!content.trim().startsWith("{")) return null;

  try {
    const payload: unknown = JSON.parse(content);
    return isTarotReadingPayload(payload) ? payload : null;
  } catch {
    return null;
  }
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

function chatHasTarotReading(chat: Chat | undefined) {
  return Boolean(
    chat?.messages.some(
      (message) =>
        message.service === "tarot" &&
        Boolean(parseTarotReadingContent(message.content))
    )
  );
}

function chatHasNumerologyBlueprint(chat: Chat | undefined) {
  return Boolean(
    chat?.messages.some(
      (message) =>
        message.service === "numerology" &&
        Boolean(parseNumerologyBlueprint(message.content))
    )
  );
}

function getBrowserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

async function parseJsonResponse(response: Response) {
  const rawResponse = await response.text();

  if (!rawResponse) return {};

  try {
    const parsed: unknown = JSON.parse(rawResponse);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getTarotSessionErrorMessage(payload: Record<string, unknown>) {
  const error = typeof payload.error === "string" ? payload.error : payload.code;

  if (error === "AUTH_REQUIRED") {
    return "Your session has expired. Please sign in again.";
  }

  if (error === "INVALID_REQUEST") {
    return "Please enter a question and choose a reading type.";
  }

  if (error === "CHAT_NOT_FOUND" || error === "INVALID_CHAT_SERVICE") {
    return "The Tarot conversation could not be created. Please refresh and try again.";
  }

  if (error === "TAROT_STORAGE_NOT_CONFIGURED") {
    return "Tarot setup is not complete yet.";
  }

  if (error === "SESSION_CREATE_FAILED") {
    return "The cards could not be prepared. Please try again.";
  }

  return typeof payload.message === "string"
    ? payload.message
    : "The cards could not be prepared. Please check your connection.";
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

function getNumerologyErrorMessage(
  data: Record<string, unknown>,
  fallbackStatus: number,
) {
  const error = typeof data.error === "string" ? data.error : "";
  const messages: Record<string, string> = {
    AUTH_REQUIRED: "Your session has expired. Please sign in again.",
    BIRTH_PROFILE_INCOMPLETE:
      "Complete your full name and date of birth to create your Numerology profile.",
    CHAT_NOT_FOUND: "The Numerology conversation could not be found.",
    CALCULATION_FAILED: "Bhagya could not calculate your Numerology profile.",
    PROFILE_SAVE_FAILED:
      "Your numbers were calculated, but the profile could not be saved.",
    PROFILE_LOAD_FAILED:
      "Your saved Numerology profile could not be loaded. Please try again.",
    BIRTH_PROFILE_LOAD_FAILED:
      "Your birth profile could not be loaded. Please try again.",
    MESSAGE_SAVE_FAILED:
      "Your Number Blueprint could not be saved. Please try again.",
    INTERPRETATION_FAILED:
      "Your numbers are ready, but Bhagya could not complete the interpretation.",
  };

  if (messages[error]) return messages[error];
  if (typeof data.message === "string") return data.message;
  if (typeof data.answer === "string") return data.answer;
  return `Your Number Blueprint could not be prepared. Error ${fallbackStatus}.`;
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
  const { preferences, isLoading: isLoadingPreferences, isAuthenticated: hasPreferenceSession, updatePreferences } = useUserPreferences();
  const { profile: cachedProfile, sessionUser: cachedSessionUser } = useSettingsProfile();

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
  const [tarotQuestion, setTarotQuestion] = useState("");
  const [tarotSpreadType, setTarotSpreadType] =
    useState<TarotSpreadType>("three-card");
  const [tarotStatus, setTarotStatus] = useState<TarotFlowStatus>("idle");
  const [tarotSession, setTarotSession] = useState<TarotSessionState | null>(
    null
  );
  const [tarotSelectedIndexes, setTarotSelectedIndexes] = useState<number[]>(
    []
  );
  const [tarotError, setTarotError] = useState("");
  const [isNumerologyInitializing, setIsNumerologyInitializing] = useState(false);
  const [numerologyError, setNumerologyError] = useState("");

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState("ME");
  const [userAvatarUrl, setUserAvatarUrl] = useState("");
  const [userDisplayName, setUserDisplayName] = useState("");
  const [userEmail, setUserEmail] = useState("");
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
  const numerologyInitializationRef = useRef<Set<string>>(new Set());
  const desktopProfileButtonRef = useRef<HTMLButtonElement>(null);
  const mobileProfileButtonRef = useRef<HTMLButtonElement>(null);
  const profileMenuTriggerRef = useRef<HTMLButtonElement | null>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId);
  const activeChatHasPalmImage = chatHasPalmImage(activeChat);
  const activeChatHasTarotReading = chatHasTarotReading(activeChat);
  const activeChatHasNumerologyBlueprint =
    chatHasNumerologyBlueprint(activeChat);
  const isTarotFlowActive =
    selectedService === "tarot" &&
    (!activeChatHasTarotReading || tarotStatus !== "idle");
  const hasStarted = Boolean(activeChatId);
  const showMobileLanding =
    !isLoggedIn && !hasStarted;
  const selectedApi = services.find((s) => s.id === selectedService)?.api;
  const t = UI_TEXT[selectedLanguage];
  const selectedLanguageLabel =
    languages.find((lang) => lang.code === selectedLanguage)?.label ||
    "English";
  const profileMenuName = cachedProfile?.firstName || cachedProfile?.fullName || cachedSessionUser?.fullName || userDisplayName;
  const profileMenuEmail = cachedProfile?.email || cachedSessionUser?.email || userEmail;

  const toggleProfileMenu = useCallback((trigger: HTMLButtonElement) => {
    profileMenuTriggerRef.current = trigger;
    setIsProfileMenuOpen((open) => !open);
  }, []);

  const closeProfileMenu = useCallback((restoreFocus = false) => {
    setIsProfileMenuOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => profileMenuTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isLoggedIn || isLoadingPreferences || !hasPreferenceSession || activeChatId) return;
    const language: LanguageCode = preferences.language === "hi" ? "hindi" : "english";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize server-backed account preferences after authentication
    setSelectedLanguage(language);
    setSelectedService(preferences.defaultService);
    setHasLoadedLanguage(true);
  }, [activeChatId, hasPreferenceSession, isLoadingPreferences, isLoggedIn, preferences.defaultService, preferences.language]);

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
    if (hasLoadedLanguage && !isLoggedIn) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, selectedLanguage);
    }
  }, [hasLoadedLanguage, isLoggedIn, selectedLanguage]);

  useEffect(() => {
    if (!isLoggedIn || isLoadingPreferences || activeChatId) return;
    const language = selectedLanguage === "hindi" ? "hi" : selectedLanguage === "english" ? "en" : null;
    if (language && language !== preferences.language) void updatePreferences({ language });
  }, [activeChatId, isLoadingPreferences, isLoggedIn, preferences.language, selectedLanguage, updatePreferences]);

  useEffect(() => {
    if (isCheckingAuth) return;

    if (isLoggedIn && hasCompleteBirthProfile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- load persisted chats after auth state is known
      void loadUserChats();
      return;
    }

    if (!isLoggedIn || !authenticatedUserId) {
      setChats([]);
      setActiveChatId(null);
      setIsSidebarOpen(false);
      setHasCompleteBirthProfile(false);
    }
  }, [hasCompleteBirthProfile, isCheckingAuth, isLoggedIn, loadUserChats]);

  useEffect(() => {
    if (isCheckingAuth) return;

    if (!isLoggedIn || !authenticatedUserId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset auth-dependent profile state when the session ends
      setIsCheckingBirthProfile(false);
      setHasCompleteBirthProfile(false);
      return;
    }

    const userId = authenticatedUserId;

    if (verifiedBirthProfileUsers.has(userId)) {
      setHasCompleteBirthProfile(true);
      setIsCheckingBirthProfile(false);
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

        if (res.ok && data.exists === false) {
          router.replace("/birth-details");
          return;
        }

        if (res.ok && data.exists === true && isMounted) {
          verifiedBirthProfileUsers.add(userId);
          setHasCompleteBirthProfile(true);
        }
      } catch {
        // Keep the homepage visible. A failed check is not evidence of a missing profile.
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
  }, [authenticatedUserId, getAuthHeaders, isCheckingAuth, isLoggedIn, router]);

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
    function syncUserIdentity(user: { email?: string; user_metadata?: Record<string, unknown> } | null | undefined) {
      const metadata = user?.user_metadata;
      const displayName =
        (typeof metadata?.full_name === "string" && metadata.full_name) ||
        (typeof metadata?.name === "string" && metadata.name) ||
        user?.email?.split("@")[0] || "Me";
      const initials = displayName.trim().split(/\s+/).slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase()).join("");
      const avatarUrl =
        (typeof metadata?.avatar_url === "string" && metadata.avatar_url) ||
        (typeof metadata?.picture === "string" && metadata.picture) || "";
      setUserInitials(initials || "ME");
      setUserAvatarUrl(avatarUrl);
      setUserDisplayName(displayName);
      setUserEmail(user?.email || "");
    }

    async function checkAuth() {
      const { data } = await supabase.auth.getUser();
      setIsLoggedIn(Boolean(data.user));
      setAuthenticatedUserId(data.user?.id || null);
      syncUserIdentity(data.user);
      setIsCheckingAuth(false);
    }

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session?.user));
      setAuthenticatedUserId(session?.user.id || null);
      syncUserIdentity(session?.user);
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
    setIsProfileMenuOpen(false);
    setActiveChatId(null);
    setQuestion("");
    setPalmImage(null);
    setPalmAnalysisError(null);
    clearPalmScanImageSource();
    setIsPalmScanReady(false);
    setPalmVisualMap(null);
    resetTarotFlow();
    setNumerologyError("");
    setIsNumerologyInitializing(false);
    setSelectedService(isLoggedIn ? preferences.defaultService : "astrology");
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
    resetTarotFlow();
    setNumerologyError("");
    setIsNumerologyInitializing(false);
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

  function resetTarotFlow(nextQuestion = "") {
    setTarotQuestion(nextQuestion);
    setTarotSpreadType("three-card");
    setTarotStatus("idle");
    setTarotSession(null);
    setTarotSelectedIndexes([]);
    setTarotError("");
  }

  function handleServiceChange(service: ServiceType) {
    setSelectedService(service);
    if (service !== "tarot") {
      resetTarotFlow();
    }
    if (service === "numerology" && isLoggedIn && hasCompleteBirthProfile) {
      void openNumerologyExperience();
    }
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

  async function initializeNumerologyChat(chatId: string) {
    if (numerologyInitializationRef.current.has(chatId)) return;

    numerologyInitializationRef.current.add(chatId);
    setIsNumerologyInitializing(true);
    setNumerologyError("");

    try {
      const headers = await getAuthHeaders();
      if (!headers) throw new Error("Please sign in again to view your Number Blueprint.");

      const res = await fetch("/api/numerology", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "calculate-profile",
          chatId,
          timezone: preferences.timezone || getBrowserTimezone(),
          languageCode: selectedLanguage,
        }),
      });
      const data = await parseJsonResponse(res);

      if (res.status === 401) {
        router.push("/login?next=/");
        return;
      }

      if (!res.ok || !isRecord(data.message)) {
        throw new Error(getNumerologyErrorMessage(data, res.status));
      }

      const blueprintMessage = mapDbMessage(data.message, "numerology");
      const profileUpdatedMessage = isRecord(data.profileUpdatedMessage)
        ? mapDbMessage(data.profileUpdatedMessage, "numerology")
        : null;
      setChats((prev) =>
        prev.map((chat) => {
          if (chat.id !== chatId) return chat;

          const existingIndex = chat.messages.findIndex((message) =>
            Boolean(parseNumerologyBlueprint(message.content))
          );
          const messages = [...chat.messages];

          if (existingIndex >= 0) {
            messages[existingIndex] = blueprintMessage;
          } else {
            messages.push(blueprintMessage);
          }

          if (
            profileUpdatedMessage &&
            !messages.some((message) => message.id === profileUpdatedMessage.id)
          ) {
            messages.push(profileUpdatedMessage);
          }

          return { ...chat, service: "numerology", messages };
        })
      );
    } catch (error) {
      setNumerologyError(
        error instanceof Error
          ? error.message
          : "Your Number Blueprint could not be prepared. Please try again."
      );
    } finally {
      numerologyInitializationRef.current.delete(chatId);
      setIsNumerologyInitializing(false);
    }
  }

  async function openNumerologyExperience() {
    if (isCheckingAuth || isCheckingBirthProfile || isNumerologyInitializing) return;

    if (!isLoggedIn) return;
    if (!hasCompleteBirthProfile) {
      router.replace("/birth-details");
      return;
    }

    const current = chats.find(
      (chat) => chat.id === activeChatId && chat.service === "numerology"
    );
    const existing = current || chats.find((chat) => chat.service === "numerology");

    if (existing) {
      await selectChat(existing);
      return;
    }

    const newChat = await createServerChat({
      title: "My Number Blueprint",
      service: "numerology",
      languageCode: selectedLanguage,
    });

    if (!newChat) {
      setNumerologyError("Your Numerology chat could not be created. Please try again.");
      return;
    }

    setActiveChatId(newChat.id);
    setChats((prev) => [newChat, ...prev]);
    await initializeNumerologyChat(newChat.id);
  }

  async function handleTarotStart() {
    const cleanQuestion = tarotQuestion.trim() || "General tarot guidance";

    if (isCheckingAuth || isLoading) return;

    if (!isLoggedIn) {
      localStorage.setItem(PENDING_QUESTION_KEY, cleanQuestion);
      router.push("/login?next=/");
      return;
    }

    const headers = await getAuthHeaders();

    if (!headers) {
      localStorage.setItem(PENDING_QUESTION_KEY, cleanQuestion);
      setIsLoggedIn(false);
      router.push("/login?next=/");
      return;
    }

    setSelectedService("tarot");
    setTarotError("");
    setTarotQuestion(cleanQuestion);
    setTarotSession(null);
    setTarotSelectedIndexes([]);
    setTarotStatus("shuffling");
    setIsLoading(true);

    let chatId = activeChatId;
    let workingChat = chatId
      ? chats.find((chat) => chat.id === chatId) || null
      : null;
    let pendingChat: Chat | null = null;

    if (workingChat && workingChat.service !== "tarot") {
      chatId = null;
      workingChat = null;
    }

    if (!chatId) {
      const newChat = await createServerChat({
        title: makeTitle(cleanQuestion),
        service: "tarot",
        languageCode: selectedLanguage,
      });

      if (!newChat) {
        setTarotError("Could not create a Tarot chat. Please try again.");
        setTarotSession(null);
        setTarotSelectedIndexes([]);
        setTarotStatus("asking");
        setIsLoading(false);
        return;
      }

      chatId = newChat.id;
      workingChat = newChat;
      pendingChat = newChat;
    }

    if (!chatId || !workingChat) {
      setTarotError("Could not prepare your Tarot reading. Please try again.");
      setTarotSession(null);
      setTarotSelectedIndexes([]);
      setTarotStatus("asking");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/tarot", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "create-session",
          chatId,
          question: cleanQuestion,
          spreadType: tarotSpreadType,
          language: selectedLanguageLabel,
          languageCode: selectedLanguage,
        }),
      });

      const data = await parseJsonResponse(res);

      if (!res.ok) {
        if (process.env.NODE_ENV !== "production") {
          console.error("Tarot session request failed", {
            status: res.status,
            error: data.error,
            message: data.message,
          });
        }

        throw new Error(getTarotSessionErrorMessage(data));
      }

      const availablePositions =
        typeof data.availablePositions === "number"
          ? Array.from({ length: data.availablePositions }, (_, index) => index)
          : Array.isArray(data.availablePositions)
            ? data.availablePositions.filter(
                (index: unknown): index is number =>
                  typeof index === "number" && Number.isInteger(index)
              )
            : [];

      if (
        typeof data.readingSessionId !== "string" ||
        availablePositions.length <= 0 ||
        !Array.isArray(data.spreadPositions)
      ) {
        throw new Error("Bhagya could not prepare the Tarot spread.");
      }

      setTarotQuestion(cleanQuestion);
      setTarotSession({
        id: data.readingSessionId,
        spreadType: data.spreadType === "one-card" ? "one-card" : "three-card",
        spreadName:
          typeof data.spreadName === "string" ? data.spreadName : "Tarot Spread",
        selectionCount:
          typeof data.selectionCount === "number"
            ? data.selectionCount
            : tarotSpreadType === "one-card"
              ? 1
              : 3,
        availablePositions,
        spreadPositions: data.spreadPositions.filter(
          (position: unknown): position is string => typeof position === "string"
        ),
      });
      setTarotSelectedIndexes([]);
      if (pendingChat) {
        setActiveChatId(pendingChat.id);
        setChats((prev) => [pendingChat, ...prev]);
      }
      setTarotStatus("selecting");
    } catch (error) {
      setTarotError(
        error instanceof Error
          ? error.message
          : "The cards could not be prepared. Please check your connection."
      );
      setTarotSession(null);
      setTarotSelectedIndexes([]);
      setTarotStatus("asking");
    } finally {
      setIsLoading(false);
    }
  }

  function handleTarotCardToggle(index: number) {
    if (!tarotSession || tarotStatus !== "selecting") return;

    setTarotSelectedIndexes((prev) => {
      if (prev.includes(index)) {
        return prev.filter((item) => item !== index);
      }

      if (prev.length >= tarotSession.selectionCount) return prev;
      return [...prev, index];
    });
  }

  async function handleTarotReveal() {
    if (!tarotSession || isLoading || tarotStatus !== "selecting") return;

    if (tarotSelectedIndexes.length !== tarotSession.selectionCount) {
      setTarotError(`Choose ${tarotSession.selectionCount} card(s) first.`);
      return;
    }

    const chatId = activeChatId;

    if (!chatId) {
      setTarotError("Could not find this Tarot chat. Please try again.");
      return;
    }

    const headers = await getAuthHeaders();

    if (!headers) {
      setIsLoggedIn(false);
      router.push("/login?next=/");
      return;
    }

    setTarotError("");
    setTarotStatus("revealing");
    setIsLoading(true);

    try {
      const res = await fetch("/api/tarot", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "reveal",
          readingSessionId: tarotSession.id,
          selectedIndexes: tarotSelectedIndexes,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof data.message === "string"
            ? data.message
            : "Bhagya could not reveal these cards. Please try again."
        );
      }

      const assistantContent =
        typeof data.messageContent === "string"
          ? data.messageContent
          : JSON.stringify({
              type: TAROT_MESSAGE_TYPE,
              service: "tarot",
              readingId: data.readingId || makeId(),
              question: tarotQuestion,
              spreadType: tarotSession.spreadType,
              spreadName: tarotSession.spreadName,
              cards: Array.isArray(data.cards) ? data.cards : [],
              interpretation:
                typeof data.reading === "string"
                  ? data.reading
                  : "Your Tarot reading is ready.",
            });

      const userMessage: Message = {
        id: makeId(),
        role: "user",
        content: tarotQuestion,
        service: "tarot",
        languageCode: selectedLanguage,
      };
      const assistantMessage: Message = {
        id: makeId(),
        role: "assistant",
        content: assistantContent,
        service: "tarot",
        languageCode: selectedLanguage,
      };

      setChats((prev) => {
        const existing = prev.find((chat) => chat.id === chatId);

        if (!existing) return prev;

        const updated: Chat = {
          ...existing,
          service: "tarot",
          updatedAt: Date.now(),
          messages: [...existing.messages, userMessage, assistantMessage],
        };

        return [updated, ...prev.filter((chat) => chat.id !== chatId)];
      });

      setTarotStatus("complete");
      setTarotSession(null);
      setTarotSelectedIndexes([]);
      setTarotQuestion("");
      await loadUserChats();
      setTarotStatus("idle");
    } catch (error) {
      setTarotError(
        error instanceof Error
          ? error.message
          : "Bhagya could not reveal these cards. Please try again."
      );
      setTarotStatus("selecting");
    } finally {
      setIsLoading(false);
    }
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

    if (
      isCheckingAuth ||
      isCheckingBirthProfile ||
      isLoading ||
      isNumerologyInitializing
    ) return;

    if (!isLoggedIn) {
      localStorage.setItem(PENDING_QUESTION_KEY, cleanQuestion);
      router.push("/login?next=/");
      return;
    }

    if (
      selectedService === "tarot" &&
      activeChatHasTarotReading &&
      /\b(new|fresh|another|draw|shuffle)\b/i.test(cleanQuestion) &&
      /\b(reading|spread|card|cards|tarot)\b/i.test(cleanQuestion)
    ) {
      setQuestion("");
      setTarotQuestion("");
      setTarotSession(null);
      setTarotSelectedIndexes([]);
      setTarotError("");
      setTarotStatus("asking");
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

      if (selectedService === "numerology") {
        await initializeNumerologyChat(chatId);
      }
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
      // eslint-disable-next-line react-hooks/purity -- event-handler timing is intentionally measured around the request
      const requestStartedAt = Date.now();

      const res = await fetch(selectedApi || "/api/astrology", {
        method: "POST",
        headers: {
          ...headers,
          "X-Bhagya-Skip-Persistence": "true",
        },
        body: JSON.stringify({
          action: selectedService === "numerology" ? "chat" : undefined,
          chatId,
          service: selectedService,
          question: cleanQuestion,
          messages: conversationHistory,
          language: selectedLanguageLabel,
          languageCode: selectedLanguage,
          timezone:
            selectedService === "numerology" ? preferences.timezone || getBrowserTimezone() : undefined,
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

      const finalAnswer = data.answer || data.message || t.silentError;
      // eslint-disable-next-line react-hooks/purity -- event-handler timing is intentionally measured around the request
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
    resetTarotFlow();
    setNumerologyError("");
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

      if (chat.service === "numerology") {
        await initializeNumerologyChat(chat.id);
      }
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
        <div className="bhagya-mandala-stage absolute">
          {/* Outer orbit */}
          <div
            className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-400/10"
            style={{
              width: "min(118vw, 900px)",
              animation: "centeredSpinCCW 280s linear infinite",
            }}
          />

          {/* Middle orbit */}
          <div
            className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border border-sky-400/10"
            style={{
              width: "min(102vw, 660px)",
              animation: "centeredSpinCW 200s linear infinite",
            }}
          />

          {/* Main mandala image */}
          <div
            className="absolute left-1/2 top-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full bg-contain bg-center bg-no-repeat opacity-[0.20] mix-blend-screen"
            style={{
              width: "min(92vw, 720px)",
              backgroundImage: "url('/mandala.png?v=20260723-name-free')",
              animation: "centeredSpinCW 180s linear infinite",
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

      <SidebarRail
          isLoggedIn={isLoggedIn}
          isChatsOpen={isSidebarOpen}
          isProfileMenuOpen={isProfileMenuOpen}
          userInitials={userInitials}
          userAvatarUrl={userAvatarUrl}
          profileButtonRef={desktopProfileButtonRef}
          onNewMessage={startNewChat}
          onOpenRecent={() => { setIsProfileMenuOpen(false); setIsSidebarOpen(true); }}
          onToggleProfile={toggleProfileMenu}
      />

      {isLoggedIn && isProfileMenuOpen && <ProfilePopover
        avatarUrl={userAvatarUrl}
        initials={userInitials}
        name={profileMenuName}
        email={profileMenuEmail}
        language={selectedLanguageLabel}
        desktopTriggerRef={desktopProfileButtonRef}
        mobileTriggerRef={mobileProfileButtonRef}
        onClose={closeProfileMenu}
        onLanguageToggle={() => { const nextLanguage: LanguageCode = selectedLanguage === "english" ? "hindi" : "english"; setSelectedLanguage(nextLanguage); void updatePreferences({ language: nextLanguage === "hindi" ? "hi" : "en" }); }}
        onLogout={() => { closeProfileMenu(); void logoutUser(); }}
      />}

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
          className={`bhagya-history-drawer absolute left-0 top-0 flex h-full w-[88vw] max-w-[340px] flex-col border-r border-white/[0.08] backdrop-blur-3xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          style={{
            background:
              "linear-gradient(180deg, rgba(7,20,39,0.985) 0%, rgba(3,12,28,0.99) 100%)",
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
                <BhagyaLogo size={26} />
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
          {isLoggedIn && <div className="border-t border-white/[0.07] p-3">
            <Link href="/settings" prefetch onClick={() => setIsSidebarOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-white/60 transition hover:bg-white/[0.05] hover:text-sky-200">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300">⚙</span>
              Profile & Settings
            </Link>
          </div>}
        </aside>
      </div>

      {/* ══════════════════════════════════════════
          LANDING / FIRST SCREEN
      ══════════════════════════════════════════ */}
      {!hasStarted && !isLoggedIn && (
        <div className="block min-[600px]:hidden">
          <UniversalMobileLanding
            question={question}
            setQuestion={setQuestion}
            handleAsk={handleAsk}
            isLoading={isLoading || isCheckingAuth}
            inputRef={inputRef}
            selectedService={selectedService}
            setSelectedService={handleServiceChange}
            selectedLanguage={selectedLanguage}
            setSelectedLanguage={setSelectedLanguage}
            palmImage={palmImage}
            onPalmImageChange={handlePalmImageChange}
            handlePalmAnalyze={handlePalmAnalyze}
            isPalmAnalyzing={isPalmAnalyzing}
            tarotStatus={tarotStatus}
            tarotQuestion={tarotQuestion}
            setTarotQuestion={setTarotQuestion}
            tarotSpreadType={tarotSpreadType}
            setTarotSpreadType={setTarotSpreadType}
            tarotSession={tarotSession}
            tarotSelectedIndexes={tarotSelectedIndexes}
            tarotError={tarotError}
            handleTarotStart={handleTarotStart}
            handleTarotCardToggle={handleTarotCardToggle}
            handleTarotReveal={handleTarotReveal}
            resetTarotFlow={resetTarotFlow}
            setTarotStatus={setTarotStatus}
            t={t}
          />
        </div>
      )}

      {!hasStarted && (
        <div
          className={`bhagya-desktop-shell bhagya-landing relative z-10 min-h-[100svh] flex-col overflow-hidden ${
            !isLoggedIn ? "hidden min-[600px]:flex" : "flex"
          }`}
        >
          {chats.length > 0 && (
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="fixed left-4 top-24 z-30 flex h-10 w-10 items-center justify-center rounded-2xl border border-sky-200/[0.10] bg-[#071427]/80 text-sky-100/55 backdrop-blur-2xl transition hover:border-sky-400/35 hover:bg-sky-500/10 hover:text-sky-300 sm:hidden"
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
          <header className="flex w-full items-center justify-between gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+16px)] sm:px-8 sm:py-5">
            <Link href="/" className="group flex items-center gap-2.5">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl shadow-lg shadow-sky-500/20 transition group-hover:scale-105 sm:h-9 sm:w-9"
                style={{
                  background: "linear-gradient(135deg, #38bdf8, #1d4ed8)",
                }}
              >
                <BhagyaLogo size={29} />
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

            <div className="ml-auto"><TopNavigation /></div>

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
              ) : selectedService === "tarot" ? (
                <TarotExperience
                  status={tarotStatus}
                  question={tarotQuestion}
                  setQuestion={setTarotQuestion}
                  spreadType={tarotSpreadType}
                  setSpreadType={setTarotSpreadType}
                  session={tarotSession}
                  selectedIndexes={tarotSelectedIndexes}
                  error={tarotError}
                  isLoading={isLoading}
                  onStart={handleTarotStart}
                  onToggleCard={handleTarotCardToggle}
                  onReveal={handleTarotReveal}
                  onReset={() => {
                    resetTarotFlow();
                    setTarotStatus("asking");
                  }}
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
                setSelectedService={handleServiceChange}
                serviceLabels={t.services}
              />
            </div>
          </section>
        </div>
      )}

      {/* ══════════════════════════════════════════
          CHAT SCREEN
      ══════════════════════════════════════════ */}
      {hasStarted && (
        <div className="relative z-10 flex h-[100dvh] min-h-0 overflow-hidden">
          {/* ── Main chat area ── */}
          <section className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden pl-0 sm:pl-[var(--app-sidebar-width)]">
            {/* Chat header */}
            <header className="fixed left-0 right-0 top-0 z-20 flex h-[calc(56px+env(safe-area-inset-top))] items-end justify-between border-b border-white/[0.07] bg-[#020817]/75 px-3 pb-2 pt-[env(safe-area-inset-top)] backdrop-blur-2xl sm:left-[var(--app-sidebar-width)] sm:h-14 sm:items-center sm:px-4 sm:py-0">
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
                  <>
                    <button ref={mobileProfileButtonRef} type="button" onClick={(event) => toggleProfileMenu(event.currentTarget)} aria-label="Open profile" aria-expanded={isProfileMenuOpen} aria-haspopup="menu" title="Profile" className="flex h-9 w-9 items-center justify-center rounded-full border border-sky-400/20 bg-sky-500/10 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 sm:hidden">{userInitials}</button>
                    <button onClick={logoutUser} className="bhagya-pill-btn hidden text-[12px] text-white/60 transition hover:text-sky-300 sm:inline-flex">{t.logout}</button>
                  </>
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
                className={`mx-auto w-full max-w-2xl px-[14px] sm:px-4 ${
                  isTarotFlowActive
                    ? "flex min-h-full items-center justify-center py-8 sm:py-10"
                    : "space-y-4 py-4 sm:space-y-5 sm:py-6"
                }`}
                style={{
                  animation: "slideUp 0.4s cubic-bezier(0.16,1,0.3,1)",
                }}
              >
                {isTarotFlowActive ? (
                  <TarotExperience
                    compact
                    status={tarotStatus}
                    question={tarotQuestion}
                    setQuestion={setTarotQuestion}
                    spreadType={tarotSpreadType}
                    setSpreadType={setTarotSpreadType}
                    session={tarotSession}
                    selectedIndexes={tarotSelectedIndexes}
                    error={tarotError}
                    isLoading={isLoading}
                    onStart={handleTarotStart}
                    onToggleCard={handleTarotCardToggle}
                    onReveal={handleTarotReveal}
                    onReset={() => {
                      resetTarotFlow();
                      setTarotStatus("asking");
                    }}
                  />
                ) : null}

                {!isTarotFlowActive &&
                  selectedService === "numerology" &&
                  !activeChatHasNumerologyBlueprint &&
                  (isNumerologyInitializing || numerologyError) && (
                    <NumerologyStatusCard
                      isLoading={isNumerologyInitializing}
                      error={numerologyError}
                      onRetry={() => {
                        if (activeChatId) void initializeNumerologyChat(activeChatId);
                      }}
                      onOpenBirthProfile={() => router.push("/birth-details")}
                    />
                  )}

                {!isTarotFlowActive &&
                  activeChat?.messages.map((message, idx) => (
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
                          : parseTarotReadingContent(message.content) ||
                              parseNumerologyBlueprint(message.content)
                            ? "w-full max-w-full"
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
                          parseNumerologyBlueprint(message.content)
                            ? "p-0"
                            : parseMessageContent(message.content).imageUrl
                            ? "p-2"
                            : "px-4 py-3"
                        } text-[15px] leading-6 sm:text-[15px] ${
                          message.role === "user"
                            ? "text-white"
                            : parseNumerologyBlueprint(message.content)
                              ? "text-white/82"
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
                            : parseNumerologyBlueprint(message.content)
                              ? { background: "transparent" }
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
                          <MessageContent
                            message={message}
                            onNumerologyPromptSelect={(prompt) => {
                              setQuestion(prompt);
                              window.requestAnimationFrame(() => inputRef.current?.focus());
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {!isTarotFlowActive &&
                  palmAnalysisError &&
                  selectedService === "palmistry" && (
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
              className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/[0.07] backdrop-blur-2xl sm:left-[var(--app-sidebar-width)]"
              style={{
                background: "rgba(2,8,23,0.94)",
                paddingBottom: "env(safe-area-inset-bottom)",
              }}
            >
              {/* Service mode pills */}
              <div className="mx-auto max-w-2xl px-3 pt-3">
                <ServiceTabs
                  selectedService={selectedService}
                  setSelectedService={handleServiceChange}
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
                ) : isTarotFlowActive ? (
                  null
                ) : (
                  <ChatInput
                    question={question}
                    setQuestion={setQuestion}
                    handleAsk={handleAsk}
                    isLoading={
                      isLoading || isCheckingAuth || isNumerologyInitializing
                    }
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

        @keyframes centeredSpinCW {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(360deg); }
        }

        @keyframes centeredSpinCCW {
          from { transform: translate(-50%, -50%) rotate(0deg); }
          to   { transform: translate(-50%, -50%) rotate(-360deg); }
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
          border: 1px solid transparent;
          border-radius: 10px;
          color: rgba(180,204,226,0.68);
          transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
        }

        .bhagya-rail-btn:hover,
        .bhagya-rail-btn:focus-visible {
          background: rgba(46,125,181,0.10);
          border-color: rgba(86,180,239,0.14);
          color: rgba(225,244,255,0.96);
        }

        .bhagya-rail-btn:active {
          background: rgba(46,125,181,0.14);
        }

        .bhagya-sidebar {
          width: var(--app-sidebar-width);
          height: 100svh;
          padding: calc(env(safe-area-inset-top) + 10px) 7px calc(env(safe-area-inset-bottom) + 10px);
          border-right: 1px solid rgba(95,159,211,0.12);
          background: linear-gradient(180deg, rgba(8,20,39,0.985) 0%, rgba(4,13,29,0.99) 100%);
          box-shadow: inset -1px 0 0 rgba(89,167,224,0.04), 8px 0 28px rgba(0,20,55,0.10);
          backdrop-filter: blur(18px);
        }

        .bhagya-sidebar-logo {
          border: 1px solid rgba(73,176,235,0.14);
          background: rgba(9,29,53,0.90);
          box-shadow: 0 0 18px rgba(36,153,225,0.08);
          transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, box-shadow 150ms ease;
        }

        .bhagya-sidebar-logo:hover,
        .bhagya-sidebar-logo:focus-visible {
          border-color: rgba(86,180,239,0.24);
          background: rgba(35,105,158,0.16);
          color: rgba(225,244,255,0.98);
        }

        .bhagya-rail-btn-active {
          background: linear-gradient(145deg, rgba(15,147,210,0.18), rgba(41,84,184,0.16));
          border-color: rgba(84,196,255,0.25);
          box-shadow: 0 0 18px rgba(38,166,235,0.08);
          color: #69d2ff;
        }

        .bhagya-rail-btn-active::before {
          position: absolute;
          left: -8px;
          height: 16px;
          width: 2px;
          border-radius: 2px;
          background: rgb(56 189 248);
          content: "";
        }

        .bhagya-sidebar-avatar {
          display: flex;
          height: 28px;
          width: 28px;
          align-items: center;
          justify-content: center;
          overflow: visible;
          border: 1px solid rgba(125,211,252,0.35);
          border-radius: 50%;
          background: linear-gradient(145deg, #18a9d8, #3159c8);
          box-shadow: 0 0 16px rgba(33,166,234,0.16);
          color: white;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }

        .bhagya-profile-popover {
          left: calc(var(--app-sidebar-width) + 10px);
          bottom: calc(env(safe-area-inset-bottom) + 10px);
          width: clamp(230px, 22vw, 285px);
          border: 1px solid rgba(91,165,218,0.18);
          border-radius: 16px;
          background: linear-gradient(160deg, rgba(9,24,45,0.985), rgba(4,14,31,0.985));
          padding: 14px;
          box-shadow: 0 18px 50px rgba(0,0,0,0.34);
          backdrop-filter: blur(18px);
          animation: bhagya-profile-popover-in 150ms ease-out both;
        }

        .bhagya-profile-menu-row {
          display: flex;
          min-height: 44px;
          align-items: center;
          gap: 10px;
          border-radius: 10px;
          padding: 0 10px;
          color: rgba(218,235,248,0.76);
          font-size: 13px;
          transition: background-color 150ms ease, color 150ms ease;
        }

        .bhagya-profile-menu-row:hover,
        .bhagya-profile-menu-row:focus-visible {
          background: rgba(56,189,248,0.09);
          color: rgba(235,248,255,0.96);
          outline: none;
        }

        .bhagya-profile-menu-row:focus-visible {
          box-shadow: inset 0 0 0 1px rgba(56,189,248,0.28);
        }

        @keyframes bhagya-profile-popover-in {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .bhagya-rail-tooltip {
          pointer-events: none;
          position: absolute;
          left: calc(100% + 12px);
          z-index: 60;
          width: max-content;
          max-width: 190px;
          border: 1px solid rgba(91,165,218,0.16);
          border-radius: 7px;
          background: rgba(10,25,46,0.98);
          padding: 5px 8px;
          box-shadow: 0 12px 30px rgba(0,0,0,0.24);
          color: rgba(230,244,255,0.96);
          font-size: 11px;
          line-height: 1rem;
          opacity: 0;
          transform: translateX(-3px);
          transition: opacity 140ms ease, transform 140ms ease;
          visibility: hidden;
          white-space: nowrap;
        }

        .group:hover > .bhagya-rail-tooltip,
        .group:focus-visible > .bhagya-rail-tooltip {
          opacity: 1;
          transform: translateX(0);
          visibility: visible;
        }

        .bhagya-rail-btn:focus-visible,
        .bhagya-sidebar-logo:focus-visible,
        .bhagya-sidebar-avatar:focus-visible {
          outline: 2px solid rgb(56 189 248);
          outline-offset: 2px;
        }

        @media (min-width: 640px) {
          .bhagya-history-drawer { left: var(--app-sidebar-width); }
          .bhagya-desktop-shell { margin-left: var(--app-sidebar-width); }
        }

        .bhagya-history-drawer {
          border-color: rgba(95,159,211,0.12);
          box-shadow: 14px 0 36px rgba(0,20,55,0.16);
        }

        @media (hover: none) {
          .bhagya-rail-tooltip { display: none; }
        }

        @media (max-width: 639px) {
          .bhagya-profile-popover {
            left: max(12px, env(safe-area-inset-left));
            right: max(12px, env(safe-area-inset-right));
            bottom: max(12px, env(safe-area-inset-bottom));
            width: auto;
            max-height: min(390px, calc(100dvh - 24px));
            overflow-y: auto;
            border-radius: 18px;
            padding-bottom: max(14px, env(safe-area-inset-bottom));
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .bhagya-rail-btn,
          .bhagya-sidebar-logo,
          .bhagya-rail-tooltip,
          .bhagya-profile-menu-row { transition: none; }
          .bhagya-profile-popover { animation: none; }
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
function MessageContent({
  message,
  onNumerologyPromptSelect,
}: {
  message: Message;
  onNumerologyPromptSelect: (prompt: string) => void;
}) {
  const tarotReading = parseTarotReadingContent(message.content);

  if (tarotReading) {
    return <TarotReadingMessage reading={tarotReading} />;
  }

  const numerologyProfile = parseNumerologyBlueprint(message.content);

  if (numerologyProfile) {
    return (
      <NumerologyBlueprint
        profile={numerologyProfile}
        onPromptSelect={onNumerologyPromptSelect}
      />
    );
  }

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

function NumerologyStatusCard({
  isLoading,
  error,
  onRetry,
  onOpenBirthProfile,
}: {
  isLoading: boolean;
  error: string;
  onRetry: () => void;
  onOpenBirthProfile: () => void;
}) {
  const needsBirthProfile = /birth profile|full name|date of birth/i.test(error);

  return (
    <div className="flex justify-start gap-3">
      <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-300/10 text-xs text-cyan-100">
        #
      </div>
      <div className="max-w-[92%] rounded-2xl border border-cyan-100/12 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white/70 backdrop-blur-xl sm:max-w-[72%]">
        {isLoading ? (
          <div className="flex items-center gap-2">
            <LoadingDots />
            <span>Calculating your Number Blueprint...</span>
          </div>
        ) : (
          <>
            <p>{error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 min-h-9 rounded-full border border-cyan-100/20 bg-cyan-200/[0.07] px-3 text-[12px] font-semibold text-cyan-50/80 transition hover:bg-cyan-200/[0.12]"
            >
              Try again
            </button>
            {needsBirthProfile && (
              <button
                type="button"
                onClick={onOpenBirthProfile}
                className="ml-2 mt-3 min-h-9 rounded-full border border-white/12 px-3 text-[12px] font-semibold text-white/66 transition hover:border-cyan-100/25 hover:text-cyan-50"
              >
                Complete Birth Profile
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TarotReadingMessage({
  reading,
}: {
  reading: TarotReadingMessagePayload;
}) {
  return (
    <div className="w-[min(640px,calc(100vw-72px))] max-w-full space-y-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-200/70">
          {reading.spreadName}
        </p>
        <h3 className="mt-1 text-[17px] font-semibold leading-6 text-white">
          {reading.question}
        </h3>
      </div>

      <div className="grid items-stretch gap-3 sm:grid-cols-3">
        {reading.cards.map((card) => (
          <div
            key={`${card.position}-${card.cardId}`}
            role="group"
            aria-label={`${card.name}, ${card.orientation}`}
            className="flex h-full flex-col rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3"
          >
            <TarotCardArt card={card} />
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-200/60">
                {card.position}
              </p>
              <p className="mt-1 text-sm font-semibold leading-5 text-white">
                {card.name}
              </p>
              <span
                className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                  card.orientation === "reversed"
                    ? "border-violet-300/25 bg-violet-300/10 text-violet-100/80"
                    : "border-sky-300/20 bg-sky-300/[0.08] text-sky-100/70"
                }`}
              >
                {card.orientation === "reversed" ? "Reversed" : "Upright"}
              </span>
              <p className="mt-2 text-[12px] leading-5 text-white/62">
                {card.shortMeaning}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="whitespace-pre-wrap text-[15px] leading-7 text-white/84">
        {reading.interpretation}
      </p>
    </div>
  );
}

function TarotCardArt({ card }: { card: DrawnTarotCard }) {
  const [imageFailed, setImageFailed] = useState(false);
  const keywords = card.keywords.slice(0, 3).join(" / ");

  return (
    <div className="relative min-h-[220px] aspect-[2/3] overflow-hidden rounded-xl border border-sky-300/15 bg-[#08111f] shadow-[0_18px_55px_rgba(14,165,233,0.16)]">
      {!imageFailed && card.imagePath ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={card.imagePath}
          alt=""
          onError={() => setImageFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover ${
            card.orientation === "reversed" ? "rotate-180" : ""
          }`}
        />
      ) : (
        <div
          className="flex h-full w-full flex-col items-center p-3 text-center"
          style={{
            background:
              "radial-gradient(circle at 50% 18%, rgba(56,189,248,0.24), transparent 34%), linear-gradient(160deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))",
          }}
        >
          <span className="h-1.5 w-12 flex-shrink-0 rounded-full bg-sky-300/50" />
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-100/55">
              Tarot
            </p>
            <p className="mt-2 text-lg font-semibold leading-5 text-white">
              {card.name}
            </p>
            <p className="mt-2 break-words text-[10px] uppercase leading-4 tracking-[0.16em] text-white/35">
              {keywords}
            </p>
          </div>
          <span className="h-1.5 w-12 flex-shrink-0 rounded-full bg-sky-300/50" />
        </div>
      )}
    </div>
  );
}

function TarotMandalaIcon() {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      className="h-[52%] w-[52%] drop-shadow-[0_0_18px_rgba(34,199,242,0.32)]"
      fill="none"
    >
      <circle cx="60" cy="60" r="39" stroke="rgba(125,211,252,0.44)" strokeWidth="1.2" />
      <circle cx="60" cy="60" r="25" stroke="rgba(224,242,254,0.24)" strokeWidth="1" />
      <circle cx="60" cy="60" r="7" fill="rgba(34,199,242,0.18)" stroke="rgba(224,242,254,0.72)" />
      {Array.from({ length: 12 }).map((_, index) => (
        <g key={index} transform={`rotate(${index * 30} 60 60)`}>
          <path
            d="M60 21 C66 36 66 44 60 54 C54 44 54 36 60 21Z"
            stroke="rgba(125,211,252,0.56)"
            strokeWidth="1"
            fill="rgba(34,199,242,0.08)"
          />
          <path
            d="M60 33 C64 43 64 50 60 57 C56 50 56 43 60 33Z"
            stroke="rgba(186,230,253,0.22)"
            strokeWidth="0.8"
          />
        </g>
      ))}
      {Array.from({ length: 8 }).map((_, index) => (
        <g key={`ray-${index}`} transform={`rotate(${index * 45} 60 60)`}>
          <path
            d="M60 13 L62.5 25 L60 31 L57.5 25 Z"
            fill="rgba(34,199,242,0.14)"
            stroke="rgba(224,242,254,0.32)"
            strokeWidth="0.8"
          />
        </g>
      ))}
      <circle cx="60" cy="60" r="48" stroke="rgba(34,199,242,0.16)" strokeDasharray="2 8" />
    </svg>
  );
}

function TarotCardBack({
  selected,
  selectionNumber,
  compact = false,
}: {
  selected: boolean;
  selectionNumber?: number;
  compact?: boolean;
}) {
  return (
    <span
      className={`pointer-events-none relative block h-full w-full overflow-hidden rounded-[14px] transition duration-300 motion-reduce:transform-none ${
        selected
          ? "-translate-y-1 scale-[1.035]"
          : "group-hover:-translate-y-1 group-hover:scale-[1.018]"
      }`}
      style={{
        background:
          "radial-gradient(circle at 50% 30%, rgba(34,199,242,0.18), transparent 31%), radial-gradient(circle at 50% 82%, rgba(37,99,235,0.18), transparent 36%), linear-gradient(155deg, #0b1324 0%, #07101f 56%, #020817 100%)",
        boxShadow: selected
          ? "inset 0 1px 0 rgba(255,255,255,0.16), inset 0 0 34px rgba(34,199,242,0.16), 0 18px 48px rgba(37,99,235,0.22)"
          : "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 0 28px rgba(34,199,242,0.08), 0 12px 30px rgba(2,8,23,0.4)",
      }}
    >
      <span className="absolute inset-[6px] rounded-[11px] border border-sky-200/22" />
      <span className="absolute inset-[12px] rounded-[8px] border border-white/[0.08]" />
      <span className="absolute left-1/2 top-3 h-px w-10 -translate-x-1/2 rounded-full bg-sky-200/45" />
      <span className="absolute bottom-3 left-1/2 h-px w-10 -translate-x-1/2 rounded-full bg-sky-200/45" />
      <span className="absolute inset-0 bg-[radial-gradient(circle_at_28%_18%,rgba(255,255,255,0.09),transparent_20%),linear-gradient(115deg,transparent_18%,rgba(255,255,255,0.075)_43%,transparent_62%)] opacity-60 transition group-hover:opacity-85" />
      <span className="absolute inset-0 flex items-center justify-center">
        <TarotMandalaIcon />
      </span>
      {!compact && (
        <span className="absolute inset-x-0 bottom-[17%] text-center text-[9px] font-semibold uppercase tracking-[0.22em] text-sky-100/42 sm:text-[10px]">
        Bhagya
        </span>
      )}
      {selected && (
        <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-sky-100/60 bg-sky-300/20 text-[11px] font-semibold text-white shadow-[0_0_18px_rgba(34,199,242,0.34)]">
          {selectionNumber}
        </span>
      )}
    </span>
  );
}

function TarotSparkleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function TarotHeader({
  isSelecting,
  activeSession,
  status,
  isLoading,
  onReset,
}: {
  isSelecting: boolean;
  activeSession: TarotSessionState | null;
  status: TarotFlowStatus;
  isLoading: boolean;
  onReset: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-200/70">
          Bhagya Tarot
        </p>
        <h2 className="mt-2 text-[24px] font-semibold leading-[1.15] text-white sm:text-[30px]">
          {isSelecting ? "Choose your cards" : "What would you like the cards to reveal?"}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
          {isSelecting
            ? activeSession?.spreadType === "one-card"
              ? "Choose the card that draws you in."
              : "Choose three cards for your reading. Let your intuition move first."
            : "Set your intention and let intuition guide your selection."}
        </p>
      </div>

      {(activeSession || status !== "idle") && (
        <button
          type="button"
          onClick={onReset}
          disabled={isLoading}
          className="inline-flex min-h-10 flex-shrink-0 items-center gap-2 rounded-full border border-sky-100/14 bg-white/[0.035] px-3 text-xs font-medium text-white/58 transition hover:border-sky-300/35 hover:bg-sky-300/8 hover:text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-sky-200/70">↺</span>
          Reset
        </button>
      )}
    </div>
  );
}

function IntentionInput({
  question,
  setQuestion,
}: {
  question: string;
  setQuestion: (value: string) => void;
}) {
  const suggestions = [
    "Love",
    "Career",
    "Money",
    "Personal growth",
    "A decision",
    "General guidance",
  ];

  function chooseSuggestion(topic: string) {
    const clean = question.trim();
    const next = `I want guidance about ${topic.toLowerCase()}.`;

    if (!clean || /^I want guidance about .+\.$/i.test(clean)) {
      setQuestion(next);
      return;
    }

    if (clean.toLowerCase().includes(topic.toLowerCase())) return;
    setQuestion(`${clean}\nFocus: ${topic}.`);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <div className="pointer-events-none absolute left-4 top-4 text-sky-200/45">
          <TarotSparkleIcon />
        </div>
        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about love, work, money, a decision, or what lies ahead..."
          rows={3}
          className="min-h-[132px] w-full resize-none rounded-[22px] border border-sky-100/14 bg-[#07101f] px-12 py-4 text-[15px] leading-7 text-white outline-none shadow-[inset_0_0_38px_rgba(34,199,242,0.045)] transition placeholder:text-white/35 focus:border-sky-300/45 focus:shadow-[inset_0_0_42px_rgba(34,199,242,0.08),0_0_0_1px_rgba(34,199,242,0.16)]"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {suggestions.map((topic) => {
          const active = question.toLowerCase().includes(topic.toLowerCase());

          return (
            <button
              key={topic}
              type="button"
              onClick={() => chooseSuggestion(topic)}
              className={`min-h-10 rounded-full border px-3.5 text-xs font-medium transition ${
                active
                  ? "border-sky-300/55 bg-sky-300/10 text-sky-100 shadow-[0_0_24px_rgba(34,199,242,0.12)]"
                  : "border-white/10 bg-white/[0.035] text-white/62 hover:border-sky-300/35 hover:text-sky-100"
              }`}
            >
              {topic}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SpreadSelector({
  spreadType,
  setSpreadType,
}: {
  spreadType: TarotSpreadType;
  setSpreadType: (value: TarotSpreadType) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(["one-card", "three-card"] as const).map((spread) => {
        const selected = spreadType === spread;

        return (
          <button
            key={spread}
            type="button"
            aria-pressed={selected}
            onClick={() => setSpreadType(spread)}
            className={`group relative min-h-[132px] overflow-hidden rounded-[22px] border p-4 text-left transition duration-200 ${
              selected
                ? "border-sky-300/55 bg-sky-400/10 text-white shadow-[0_18px_48px_rgba(34,199,242,0.13)]"
                : "border-white/[0.09] bg-white/[0.035] text-white/74 hover:border-sky-300/30 hover:bg-white/[0.055]"
            }`}
          >
            <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(34,199,242,0.12),transparent_34%)] opacity-75" />
            <span className="relative flex items-start justify-between gap-3">
              <span>
                <span className="mb-3 flex h-10 items-center">
                  {spread === "one-card" ? <SingleCardMark /> : <ThreeCardMark />}
                </span>
                <span className="block text-base font-semibold">
                  {spread === "one-card" ? "One Card" : "Three Cards"}
                </span>
                <span className="mt-1 block text-sm leading-5 text-white/50">
                  {spread === "one-card"
                    ? "A clear message for the present moment"
                    : "Past · Present · Direction"}
                </span>
                <span className="mt-3 inline-flex rounded-full border border-sky-100/12 bg-black/18 px-2.5 py-1 text-[11px] font-medium text-sky-100/64">
                  {spread === "one-card" ? "Quick guidance" : "Deeper reading"}
                </span>
              </span>
              {selected && (
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-sky-100/60 bg-sky-300/20 text-xs text-white">
                  ✓
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SingleCardMark() {
  return (
    <span className="block h-9 w-6 rounded-md border border-sky-200/45 bg-gradient-to-b from-sky-200/14 to-indigo-950 shadow-[0_10px_24px_rgba(34,199,242,0.14)]" />
  );
}

function ThreeCardMark() {
  return (
    <span className="relative block h-10 w-14">
      <span className="absolute left-0 top-2 h-8 w-5 -rotate-12 rounded-md border border-sky-200/35 bg-indigo-950" />
      <span className="absolute left-4 top-0 h-9 w-6 rounded-md border border-sky-200/50 bg-gradient-to-b from-sky-200/14 to-indigo-950 shadow-[0_10px_24px_rgba(34,199,242,0.14)]" />
      <span className="absolute right-0 top-2 h-8 w-5 rotate-12 rounded-md border border-sky-200/35 bg-indigo-950" />
    </span>
  );
}

function ReadingSlots({
  activeSession,
  selectedIndexes,
}: {
  activeSession: TarotSessionState;
  selectedIndexes: number[];
}) {
  const labels =
    activeSession.spreadType === "one-card"
      ? ["Your Message"]
      : activeSession.spreadPositions.slice(0, activeSession.selectionCount);

  return (
    <div className={`grid gap-3 ${labels.length === 1 ? "mx-auto max-w-[180px]" : "sm:grid-cols-3"}`}>
      {labels.map((label, index) => {
        const assigned = selectedIndexes[index] !== undefined;

        return (
          <div
            key={`${label}-${index}`}
            className={`rounded-[18px] border p-3 text-center transition ${
              assigned
                ? "border-white/90 bg-[#07101f]/70 shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_0_22px_rgba(255,255,255,0.18),inset_0_0_18px_rgba(255,255,255,0.05)]"
                : "border-white/[0.08] bg-[#07101f]/70"
            }`}
          >
            <div className="relative mx-auto aspect-[2/3] w-14 rounded-[14px] border border-dashed border-sky-100/18 p-[2px] sm:w-16">
              {assigned ? (
                <>
                  <div className="absolute inset-[-12px] rounded-full bg-[radial-gradient(circle,rgba(192,132,252,0.24),rgba(168,85,247,0.14)_38%,transparent_70%)] blur-md" />
                  <div className="relative z-10 h-full w-full">
                    <TarotCardBack selected compact selectionNumber={index + 1} />
                  </div>
                </>
              ) : (
                <div className="flex h-full w-full items-center justify-center rounded-[12px] bg-white/[0.025] text-sky-100/22">
                  <TarotSparkleIcon className="h-4 w-4" />
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-100/66">
              {label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

type TarotArcTransform = {
  translateY: number;
  rotate: number;
  scale: number;
  zIndex: number;
};

const TAROT_DRAG_THRESHOLD_PX = 8;

function getTarotArcTransform(
  cardCenterX: number,
  viewportCenterX: number,
  viewportWidth: number,
): TarotArcTransform {
  const horizontalDistance = cardCenterX - viewportCenterX;
  const normalized = Math.max(
    -1,
    Math.min(1, horizontalDistance / (viewportWidth * 0.55)),
  );
  const distanceFromCenter = Math.abs(normalized);
  const arcDepth = viewportWidth < 480 ? 30 : viewportWidth < 768 ? 42 : 58;
  const maxRotation = viewportWidth < 480 ? 26 : viewportWidth < 768 ? 30 : 34;

  return {
    translateY: Math.pow(distanceFromCenter, 1.7) * arcDepth,
    rotate: normalized * maxRotation,
    scale: 1 - distanceFromCenter * 0.06,
    zIndex: 100 - Math.round(distanceFromCenter * 50),
  };
}

function TarotDeck({
  activeSession,
  selectedIndexes,
  isLoading,
  onToggleCard,
}: {
  activeSession: TarotSessionState;
  selectedIndexes: number[];
  isLoading: boolean;
  onToggleCard: (index: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef({
    pointerId: null as number | null,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    hasDragged: false,
  });
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);
  const cardRefs = useRef(new Map<number, HTMLButtonElement>());
  const animationFrameRef = useRef<number | null>(null);
  const selectedIndexesRef = useRef(selectedIndexes);
  const centeredSessionIdRef = useRef<string | null>(null);

  selectedIndexesRef.current = selectedIndexes;

  function scheduleArcUpdate() {
    if (animationFrameRef.current !== null) return;

    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      updateCardArcTransforms();
    });
  }

  function updateCardArcTransforms() {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

    const viewportRect = viewport.getBoundingClientRect();
    const trackRect = track.getBoundingClientRect();
    const viewportCenterX = viewportRect.left + viewportRect.width / 2 - trackRect.left;

    cardRefs.current.forEach((card, cardIndex) => {
      const cardCenterX = card.offsetLeft + card.offsetWidth / 2;
      const arcTransform = getTarotArcTransform(
        cardCenterX,
        viewportCenterX,
        viewportRect.width,
      );
      const selected = selectedIndexesRef.current.includes(cardIndex);
      const translateY = arcTransform.translateY + (selected ? -14 : 0);
      const scale = arcTransform.scale + (selected ? 0.025 : 0);
      const zIndex = arcTransform.zIndex + (selected ? 20 : 0);

      card.style.transform = `translate3d(0, ${translateY}px, 0) rotate(${arcTransform.rotate}deg) scale(${scale})`;
      card.style.zIndex = String(zIndex);
    });
  }

  useLayoutEffect(() => {
    const sessionId = activeSession.id;
    if (centeredSessionIdRef.current === sessionId) return;

    let frameId: number | null = null;
    let attempt = 0;

    function centerDeck() {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const maximumScrollLeft = viewport.scrollWidth - viewport.clientWidth;
      const allCardsRendered =
        cardRefs.current.size >= activeSession.availablePositions.length;

      if (maximumScrollLeft > 0 && allCardsRendered) {
        viewport.scrollLeft = Math.max(0, maximumScrollLeft / 2);
        centeredSessionIdRef.current = sessionId;
        updateCardArcTransforms();
        return;
      }

      if (attempt < 3) {
        attempt += 1;
        frameId = window.requestAnimationFrame(() => {
          frameId = null;
          centerDeck();
        });
      }
    }

    centerDeck();

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [activeSession.id, activeSession.availablePositions.length]);

  useEffect(() => {
    scheduleArcUpdate();
  });

  useEffect(() => {
    window.addEventListener("resize", scheduleArcUpdate);

    return () => {
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
      }

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }

      window.removeEventListener("resize", scheduleArcUpdate);
      document.body.style.userSelect = "";
    };
  }, []);

  function clearClickSuppressionSoon() {
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current);
    }

    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 80);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: viewport.scrollLeft,
      hasDragged: false,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    const dragState = dragStateRef.current;

    if (!viewport || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    if (
      !dragState.hasDragged &&
      Math.abs(deltaX) > TAROT_DRAG_THRESHOLD_PX &&
      Math.abs(deltaX) > Math.abs(deltaY)
    ) {
      dragState.hasDragged = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }

    if (!dragState.hasDragged) return;

    viewport.scrollLeft = dragState.startScrollLeft - deltaX;
    scheduleArcUpdate();
    event.preventDefault();
  }

  function finishPointerDrag(
    event: ReactPointerEvent<HTMLDivElement>,
    releasePointerCapture = true,
  ) {
    const viewport = viewportRef.current;
    const dragState = dragStateRef.current;

    if (dragState.pointerId !== event.pointerId) return;

    const hasDragged = dragState.hasDragged;
    const hasPointerCapture = Boolean(
      viewport?.hasPointerCapture(event.pointerId),
    );

    dragStateRef.current = {
      pointerId: null,
      startX: 0,
      startY: 0,
      startScrollLeft: 0,
      hasDragged: false,
    };

    if (viewport) {
      viewport.style.cursor = "";
    }

    document.body.style.userSelect = "";

    if (viewport && releasePointerCapture && hasPointerCapture) {
      viewport.releasePointerCapture(event.pointerId);
    }

    if (hasDragged) {
      suppressClickRef.current = true;
      clearClickSuppressionSoon();
    }
  }

  function endPointerDrag(event: ReactPointerEvent<HTMLDivElement>) {
    finishPointerDrag(event);
  }

  function handlePointerLeave(event: ReactPointerEvent<HTMLDivElement>) {
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture(event.pointerId)) return;

    finishPointerDrag(event, false);
  }

  function handleLostPointerCapture(event: ReactPointerEvent<HTMLDivElement>) {
    finishPointerDrag(event, false);
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    const viewport = event.currentTarget;
    const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;

    if (maxScrollLeft <= 0 || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
      return;
    }

    const canScrollForward = event.deltaY > 0 && viewport.scrollLeft < maxScrollLeft;
    const canScrollBackward = event.deltaY < 0 && viewport.scrollLeft > 0;

    if (!canScrollForward && !canScrollBackward) return;

    event.preventDefault();
    viewport.scrollLeft += event.deltaY;
    scheduleArcUpdate();
  }

  function handleCardClick(
    cardIndex: number,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    onToggleCard(cardIndex);
  }

  return (
    <div
      ref={viewportRef}
      role="region"
      aria-label="Swipe or scroll to choose Tarot cards"
      className="-mx-4 max-w-[calc(100%+2rem)] cursor-grab select-none overflow-x-auto overflow-y-hidden overscroll-x-contain scroll-auto px-10 pb-20 pt-5 [scrollbar-color:rgba(226,232,240,0.28)_transparent] [scrollbar-width:thin] [touch-action:pan-x] [-webkit-overflow-scrolling:touch] sm:mx-0 sm:max-w-full sm:px-16 sm:pb-24 sm:pt-6"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointerDrag}
      onPointerCancel={endPointerDrag}
      onPointerLeave={handlePointerLeave}
      onLostPointerCapture={handleLostPointerCapture}
      onScroll={scheduleArcUpdate}
      onWheel={handleWheel}
    >
      <div
        ref={trackRef}
        className="relative flex min-w-max items-start justify-start px-[calc(50%_-_29px)] pb-2 sm:px-[calc(50%_-_38px)] md:px-[calc(50%_-_42px)]"
      >
        {activeSession.availablePositions.map((cardIndex, visualIndex) => {
          const selected = selectedIndexes.includes(cardIndex);

          return (
            <button
              key={cardIndex}
              ref={(node) => {
                if (node) {
                  cardRefs.current.set(cardIndex, node);
                } else {
                  cardRefs.current.delete(cardIndex);
                }
              }}
              type="button"
              aria-pressed={selected}
              aria-label={`Select Tarot card ${visualIndex + 1} of ${activeSession.availablePositions.length}`}
              onClick={(event) => handleCardClick(cardIndex, event)}
              disabled={isLoading}
              className={`group pointer-events-auto relative -ml-3 aspect-[2/3] w-[58px] flex-shrink-0 origin-top rounded-[17px] border p-[1px] transition-[background-color,border-color,box-shadow,opacity] duration-300 first:ml-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70 sm:-ml-5 sm:w-[76px] md:-ml-6 md:w-[84px] ${
                selected
                  ? "z-20 border-white/95 bg-sky-300/15 opacity-90 shadow-[0_18px_48px_rgba(255,255,255,0.16),0_16px_44px_rgba(34,199,242,0.2)] ring-1 ring-white/75"
                  : "z-10 border-white/[0.09] bg-white/[0.035] hover:z-30 hover:border-sky-100/45 hover:shadow-[0_18px_46px_rgba(34,199,242,0.16)]"
              } disabled:cursor-not-allowed`}
            >
              <TarotCardBack
                selected={selected}
                selectionNumber={selectedIndexes.indexOf(cardIndex) + 1}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RevealActionBar({
  selectedCount,
  requiredCount,
  canReveal,
  isRevealing,
  isLoading,
  onReveal,
}: {
  selectedCount: number;
  requiredCount: number;
  canReveal: boolean;
  isRevealing: boolean;
  isLoading: boolean;
  onReveal: () => void;
}) {
  return (
    <div className="sticky bottom-0 mt-5 rounded-[20px] border border-sky-100/12 bg-[#050817]/88 p-3 shadow-[0_-14px_44px_rgba(2,8,23,0.44)] backdrop-blur-xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-white/58">
          <span className="font-semibold text-sky-100/80">{selectedCount}</span> of {requiredCount} cards selected
        </p>
        <button
          type="button"
          onClick={onReveal}
          disabled={!canReveal || isLoading}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#08b7f2] to-[#2563eb] px-5 text-sm font-semibold text-white shadow-[0_16px_42px_rgba(34,199,242,0.22)] transition hover:-translate-y-0.5 hover:brightness-95 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transform-none"
        >
          <TarotSparkleIcon className="h-4 w-4" />
          {isRevealing ? (
            <LoadingDots />
          ) : canReveal ? (
            "Reveal My Reading"
          ) : (
            `Select ${requiredCount} Cards`
          )}
        </button>
      </div>
    </div>
  );
}

function TarotExperience({
  compact = false,
  status,
  question,
  setQuestion,
  spreadType,
  setSpreadType,
  session,
  selectedIndexes,
  error,
  isLoading,
  onStart,
  onToggleCard,
  onReveal,
  onReset,
}: {
  compact?: boolean;
  status: TarotFlowStatus;
  question: string;
  setQuestion: (value: string) => void;
  spreadType: TarotSpreadType;
  setSpreadType: (value: TarotSpreadType) => void;
  session: TarotSessionState | null;
  selectedIndexes: number[];
  error: string;
  isLoading: boolean;
  onStart: () => void;
  onToggleCard: (index: number) => void;
  onReveal: () => void;
  onReset: () => void;
}) {
  const activeSession =
    status === "selecting" || status === "revealing" ? session : null;
  const isSelecting = Boolean(activeSession);
  const isShuffling = status === "shuffling";
  const isRevealing = status === "revealing";
  const canReveal =
    Boolean(activeSession) &&
    selectedIndexes.length === activeSession?.selectionCount;

  return (
    <div
      className={`relative mx-auto w-full overflow-hidden rounded-[28px] border border-sky-100/16 p-4 text-left shadow-[0_28px_110px_rgba(2,8,23,0.62)] backdrop-blur-2xl sm:p-5 ${
        compact ? "max-w-[980px]" : "max-w-[900px]"
      }`}
      style={{
        background:
          "radial-gradient(circle at 50% -20%, rgba(34,199,242,0.12), transparent 34%), radial-gradient(circle at 85% 18%, rgba(37,99,235,0.14), transparent 30%), linear-gradient(145deg, rgba(255,255,255,0.07), rgba(34,199,242,0.03)), rgba(2,8,23,0.84)",
      }}
    >
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-sky-100/10" />
      <div className="pointer-events-none absolute -bottom-28 left-10 h-72 w-72 rounded-full border border-indigo-200/10" />

      <div className="relative">
        <TarotHeader
          isSelecting={isSelecting}
          activeSession={activeSession}
          status={status}
          isLoading={isLoading}
          onReset={onReset}
        />

      {!isSelecting ? (
        <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <IntentionInput question={question} setQuestion={setQuestion} />
          </div>

          <div className="space-y-5">
            <SpreadSelector
              spreadType={spreadType}
              setSpreadType={setSpreadType}
            />

          <button
            type="button"
            onClick={onStart}
            disabled={isLoading || !question.trim()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#08b7f2] to-[#2563eb] px-5 text-sm font-semibold text-white shadow-[0_18px_48px_rgba(34,199,242,0.22)] transition hover:-translate-y-0.5 hover:brightness-95 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transform-none"
          >
            {isShuffling ? (
              <>
                <LoadingDots />
                Preparing your cards...
              </>
            ) : (
              <>
                <TarotSparkleIcon className="h-4 w-4" />
                Prepare My Reading
              </>
            )}
          </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          {activeSession && (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-100/56">
                    {activeSession.spreadName}
                  </p>
                  <p className="mt-1 text-sm text-white/52">
                    {activeSession.spreadType === "one-card"
                      ? "Choose the card that draws you in."
                      : "Choose cards in order for each reading slot."}
                  </p>
                </div>
                <p className="text-sm text-white/58">
                  <span className="font-semibold text-sky-100/80">
                    {selectedIndexes.length}
                  </span>{" "}
                  of {activeSession.selectionCount} cards selected
                </p>
              </div>

              <ReadingSlots
                activeSession={activeSession}
                selectedIndexes={selectedIndexes}
              />

              <TarotDeck
                activeSession={activeSession}
                selectedIndexes={selectedIndexes}
                isLoading={isLoading}
                onToggleCard={onToggleCard}
              />

              <RevealActionBar
                selectedCount={selectedIndexes.length}
                requiredCount={activeSession.selectionCount}
                canReveal={canReveal}
                isRevealing={isRevealing}
                isLoading={isLoading}
                onReveal={onReveal}
              />
            </>
          )}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-2xl border border-rose-300/15 bg-rose-400/10 px-3 py-2 text-sm leading-5 text-rose-100/78">
          {error}
        </p>
      )}
      </div>
    </div>
  );
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
  tarotStatus,
  tarotQuestion,
  setTarotQuestion,
  tarotSpreadType,
  setTarotSpreadType,
  tarotSession,
  tarotSelectedIndexes,
  tarotError,
  handleTarotStart,
  handleTarotCardToggle,
  handleTarotReveal,
  resetTarotFlow,
  setTarotStatus,
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
  tarotStatus: TarotFlowStatus;
  tarotQuestion: string;
  setTarotQuestion: (value: string) => void;
  tarotSpreadType: TarotSpreadType;
  setTarotSpreadType: (value: TarotSpreadType) => void;
  tarotSession: TarotSessionState | null;
  tarotSelectedIndexes: number[];
  tarotError: string;
  handleTarotStart: () => void;
  handleTarotCardToggle: (index: number) => void;
  handleTarotReveal: () => void;
  resetTarotFlow: (nextQuestion?: string) => void;
  setTarotStatus: (status: TarotFlowStatus) => void;
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
            <BhagyaLogo size={31} />
          </div>

          <div className="min-w-0">
            <p className="bhagya-mobile-brand-title">{t.appName}</p>
            <p className="bhagya-mobile-brand-subtitle">{t.tagline}</p>
          </div>
        </Link>

        <div className="bhagya-mobile-actions">
          <div className="bhagya-top-nav-slot"><TopNavigation accountLink={{ href: "/login", label: t.signIn }} /></div>
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
          ) : selectedService === "tarot" ? (
            <div className="mt-6">
              <TarotExperience
                compact
                status={tarotStatus}
                question={tarotQuestion}
                setQuestion={setTarotQuestion}
                spreadType={tarotSpreadType}
                setSpreadType={setTarotSpreadType}
                session={tarotSession}
                selectedIndexes={tarotSelectedIndexes}
                error={tarotError}
                isLoading={isLoading}
                onStart={handleTarotStart}
                onToggleCard={handleTarotCardToggle}
                onReveal={handleTarotReveal}
                onReset={() => {
                  resetTarotFlow();
                  setTarotStatus("asking");
                }}
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

function SidebarRail({
  isLoggedIn,
  isChatsOpen,
  isProfileMenuOpen,
  userInitials,
  userAvatarUrl,
  profileButtonRef,
  onNewMessage,
  onOpenRecent,
  onToggleProfile,
}: {
  isLoggedIn: boolean;
  isChatsOpen: boolean;
  isProfileMenuOpen: boolean;
  userInitials: string;
  userAvatarUrl: string;
  profileButtonRef: RefObject<HTMLButtonElement | null>;
  onNewMessage: () => void;
  onOpenRecent: () => void;
  onToggleProfile: (trigger: HTMLButtonElement) => void;
}) {
  return (
    <nav
      className="bhagya-sidebar fixed left-0 top-0 z-50 hidden flex-col items-center sm:flex"
      aria-label="Primary navigation"
    >
      <Link
        href="/"
        className="bhagya-sidebar-logo group relative mb-5 flex h-9 w-9 items-center justify-center rounded-full text-sky-300"
        aria-label="Home"
      >
        <BhagyaLogo size={27} />
        <span className="bhagya-rail-tooltip">Home</span>
      </Link>

      <button
        type="button"
        onClick={onNewMessage}
        className="bhagya-rail-btn group relative mb-2"
        aria-label="New message"
      >
        <RailIcon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" />
          </svg>
        </RailIcon>
        <span className="bhagya-rail-tooltip">New message</span>
      </button>

      <button
        type="button"
        onClick={onOpenRecent}
        className={`bhagya-rail-btn group relative ${isChatsOpen ? "bhagya-rail-btn-active" : ""}`}
        aria-label="Recent messages"
        aria-current={isChatsOpen ? "page" : undefined}
        data-active={isChatsOpen}
      >
        <RailIcon>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
            <line x1="8" y1="9" x2="16" y2="9" />
            <line x1="8" y1="13" x2="13" y2="13" />
          </svg>
        </RailIcon>
        <span className="bhagya-rail-tooltip">Recent messages</span>
      </button>

      <div className="flex-1" />

      {isLoggedIn ? <button
        ref={profileButtonRef}
        type="button"
        onClick={(event) => onToggleProfile(event.currentTarget)}
        className="bhagya-sidebar-avatar group relative"
        aria-label="Open profile"
        aria-expanded={isProfileMenuOpen}
        aria-haspopup="menu"
      >
        {userAvatarUrl ? (
          <img src={userAvatarUrl} alt="" className="h-full w-full rounded-full object-cover" />
        ) : (
          userInitials.charAt(0)
        )}
        <span className="bhagya-rail-tooltip">Profile</span>
      </button> : <Link href="/login" className="bhagya-sidebar-avatar group relative" aria-label="Sign in">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0 1 16 0" />
          </svg>
        <span className="bhagya-rail-tooltip">Sign in</span>
      </Link>}
    </nav>
  );
}

/* ── Chat input composer ── */
function ProfilePopover({
  avatarUrl,
  initials,
  name,
  email,
  language,
  desktopTriggerRef,
  mobileTriggerRef,
  onClose,
  onLanguageToggle,
  onLogout,
}: {
  avatarUrl: string;
  initials: string;
  name: string;
  email: string;
  language: string;
  desktopTriggerRef: RefObject<HTMLButtonElement | null>;
  mobileTriggerRef: RefObject<HTMLButtonElement | null>;
  onClose: (restoreFocus?: boolean) => void;
  onLanguageToggle: () => void;
  onLogout: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const menu = menuRef.current;
    const firstItem = menu?.querySelector<HTMLElement>("[role='menuitem']");
    const focusFrame = window.requestAnimationFrame(() => firstItem?.focus());

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menu?.contains(target) || desktopTriggerRef.current?.contains(target) || mobileTriggerRef.current?.contains(target)) return;
      onClose(true);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(true); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = Array.from(menu?.querySelectorAll<HTMLElement>("[role='menuitem']") || []);
      if (!items.length) return;
      event.preventDefault();
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (currentIndex + 1) % items.length : (currentIndex <= 0 ? items.length : currentIndex) - 1;
      items[nextIndex]?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [desktopTriggerRef, mobileTriggerRef, onClose]);

  return <div ref={menuRef} role="menu" aria-label="Profile" className="bhagya-profile-popover fixed z-[70]">
    <p className="px-1 pb-3 text-[10px] font-semibold uppercase tracking-[.2em] text-sky-300/65">Profile</p>
    <div className="flex min-w-0 items-center gap-3 px-1 pb-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-sky-300/30 bg-gradient-to-br from-cyan-500 to-blue-700 text-xs font-bold text-white">
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials ? initials.charAt(0) : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>}
      </div>
      <div className="min-w-0"><p className="truncate text-sm font-semibold text-white/90">{name || "Your profile"}</p><p className="truncate text-xs text-white/40">{email}</p></div>
    </div>
    <div className="border-y border-white/[.07] py-1.5">
      <Link href="/settings" prefetch role="menuitem" onClick={() => onClose()} className="bhagya-profile-menu-row"><span aria-hidden="true">⚙</span><span className="flex-1">Settings</span><span aria-hidden="true" className="text-white/25">›</span></Link>
      <button type="button" role="menuitem" onClick={onLanguageToggle} className="bhagya-profile-menu-row w-full"><span aria-hidden="true">◎</span><span className="flex-1 text-left">Language</span><span className="text-xs text-white/40">{language}</span></button>
    </div>
    <button type="button" role="menuitem" onClick={onLogout} className="bhagya-profile-menu-row mt-1.5 w-full text-rose-200/75"><span aria-hidden="true">↪</span><span className="flex-1 text-left">Log out</span></button>
  </div>;
}

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
