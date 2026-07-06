import { NextResponse } from "next/server";
import { UnauthorizedError } from "./auth";
import { RateLimitError } from "./rateLimit";
import { ValidationError } from "./validation";

const rateLimitAnswers: Record<string, string> = {
  english:
    "You are sending messages too quickly. Please wait a moment and try again.",
  hinglish:
    "Aap messages thoda zyada fast bhej rahe hain. Please ek moment wait karke phir try karein.",
  hindi:
    "आप बहुत जल्दी-जल्दी संदेश भेज रहे हैं। कृपया थोड़ा रुककर फिर कोशिश करें।",
  bengali:
    "আপনি খুব দ্রুত বার্তা পাঠাচ্ছেন। অনুগ্রহ করে একটু অপেক্ষা করে আবার চেষ্টা করুন।",
  marathi:
    "तुम्ही खूप वेगाने संदेश पाठवत आहात. कृपया थोडा वेळ थांबून पुन्हा प्रयत्न करा.",
  tamil:
    "நீங்கள் மிக வேகமாக செய்திகள் அனுப்புகிறீர்கள். தயவுசெய்து சிறிது நேரம் காத்திருந்து மீண்டும் முயற்சிக்கவும்.",
  telugu:
    "మీరు చాలా వేగంగా సందేశాలు పంపుతున్నారు. దయచేసి కాసేపు ఆగి మళ్లీ ప్రయత్నించండి.",
  gujarati:
    "તમે ખૂબ ઝડપથી સંદેશાઓ મોકલી રહ્યા છો. કૃપા કરીને થોડું રાહ જોઈ ફરી પ્રયાસ કરો.",
  punjabi:
    "ਤੁਸੀਂ ਬਹੁਤ ਤੇਜ਼ੀ ਨਾਲ ਸੁਨੇਹੇ ਭੇਜ ਰਹੇ ਹੋ। ਕਿਰਪਾ ਕਰਕੇ ਥੋੜ੍ਹਾ ਰੁਕ ਕੇ ਦੁਬਾਰਾ ਕੋਸ਼ਿਸ਼ ਕਰੋ।",
};

export function safeApiError(message?: string) {
  return {
    answer:
      message ||
      "Something went wrong while reading your chart. Please try again in a moment.",
    error: "SERVER_ERROR",
  };
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { answer: "Please login to continue.", error: "UNAUTHORIZED" },
    { status: 401 }
  );
}

export function badRequestResponse(message: string) {
  return NextResponse.json(
    { answer: message, error: "BAD_REQUEST" },
    { status: 400 }
  );
}

export function rateLimitedResponse(languageCode?: string) {
  return NextResponse.json(
    {
      answer: rateLimitAnswers[languageCode || ""] || rateLimitAnswers.english,
      error: "RATE_LIMITED",
    },
    { status: 429 }
  );
}

export function safeErrorResponse(error: unknown, routeName: string, userId?: string) {
  if (error instanceof UnauthorizedError) {
    return unauthorizedResponse();
  }

  if (error instanceof RateLimitError) {
    return rateLimitedResponse();
  }

  if (error instanceof ValidationError) {
    return NextResponse.json(
      { answer: error.message, error: "BAD_REQUEST" },
      { status: error.status }
    );
  }

  console.error("API route error:", {
    route: routeName,
    userId,
    errorName: error instanceof Error ? error.name : typeof error,
  });

  return NextResponse.json(
    safeApiError(
      "Something went wrong while connecting to Bhagya.ai. Please try again."
    ),
    { status: 500 }
  );
}

export function logSafeError(routeName: string, userId: string, error: unknown) {
  console.error("Backend operation failed:", {
    route: routeName,
    userId,
    errorName: error instanceof Error ? error.name : typeof error,
  });
}
