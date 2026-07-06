type DetailKey =
  | "dateOfBirth"
  | "birthTime"
  | "birthPlace"
  | "fullName"
  | "palmImage";

const detailNames: Record<string, Record<DetailKey, string>> = {
  english: {
    dateOfBirth: "date of birth",
    birthTime: "exact birth time",
    birthPlace: "birth place",
    fullName: "full name",
    palmImage: "clear palm photo",
  },
  hinglish: {
    dateOfBirth: "date of birth",
    birthTime: "exact birth time",
    birthPlace: "birth place",
    fullName: "full name",
    palmImage: "clear palm photo",
  },
  hindi: {
    dateOfBirth: "जन्म तारीख",
    birthTime: "जन्म समय",
    birthPlace: "जन्म स्थान",
    fullName: "पूरा नाम",
    palmImage: "हथेली की साफ फोटो",
  },
  bengali: {
    dateOfBirth: "জন্মতারিখ",
    birthTime: "জন্মসময়",
    birthPlace: "জন্মস্থান",
    fullName: "পুরো নাম",
    palmImage: "পরিষ্কার হাতের তালুর ছবি",
  },
  marathi: {
    dateOfBirth: "जन्म तारीख",
    birthTime: "जन्म वेळ",
    birthPlace: "जन्म ठिकाण",
    fullName: "पूर्ण नाव",
    palmImage: "हाताचा स्पष्ट फोटो",
  },
  tamil: {
    dateOfBirth: "பிறந்த தேதி",
    birthTime: "பிறந்த நேரம்",
    birthPlace: "பிறந்த இடம்",
    fullName: "முழு பெயர்",
    palmImage: "தெளிவான உள்ளங்கை படம்",
  },
  telugu: {
    dateOfBirth: "పుట్టిన తేదీ",
    birthTime: "పుట్టిన సమయం",
    birthPlace: "పుట్టిన స్థలం",
    fullName: "పూర్తి పేరు",
    palmImage: "స్పష్టమైన అరచేతి ఫోటో",
  },
  gujarati: {
    dateOfBirth: "જન્મ તારીખ",
    birthTime: "જન્મ સમય",
    birthPlace: "જન્મ સ્થળ",
    fullName: "પૂરું નામ",
    palmImage: "હથેળીનો સ્પષ્ટ ફોટો",
  },
  punjabi: {
    dateOfBirth: "ਜਨਮ ਤਾਰੀਖ",
    birthTime: "ਜਨਮ ਸਮਾਂ",
    birthPlace: "ਜਨਮ ਸਥਾਨ",
    fullName: "ਪੂਰਾ ਨਾਮ",
    palmImage: "ਹਥੇਲੀ ਦੀ ਸਾਫ ਫੋਟੋ",
  },
};

const joiners: Record<string, string> = {
  english: " and ",
  hinglish: " aur ",
  hindi: " और ",
  bengali: " এবং ",
  marathi: " आणि ",
  tamil: " மற்றும் ",
  telugu: " మరియు ",
  gujarati: " અને ",
  punjabi: " ਅਤੇ ",
};

function joinDetails(details: string[], languageCode: string) {
  if (details.length <= 1) return details[0] || "";

  const joiner = joiners[languageCode] || joiners.english;
  return `${details.slice(0, -1).join(", ")}${joiner}${
    details[details.length - 1]
  }`;
}

export function buildAstrologyMissingResponse(
  missing: string[],
  languageCode: string
) {
  const names = detailNames[languageCode] || detailNames.english;
  const details = joinDetails(
    missing.map((detail) => names[detail as DetailKey]),
    languageCode
  );

  if (languageCode === "hinglish") {
    return missing.length === 3
      ? "Please apni date of birth, exact birth time aur birth place share karein, taaki main aapki kundli properly dekh sakun."
      : `Please ${details} bhi share karein, taaki main kundli properly dekh sakun.`;
  }

  const templates: Record<string, string> = {
    hindi: `कृपया ${details} भी बताइए, ताकि मैं आपकी कुंडली सही तरह से देख सकूं।`,
    bengali: `অনুগ্রহ করে ${details} জানান, যাতে আমি আপনার জন্মছক ঠিকভাবে দেখতে পারি।`,
    marathi: `कृपया ${details} सांगा, म्हणजे मी तुमची कुंडली नीट पाहू शकेन.`,
    tamil: `${details} பகிரவும், அப்போதுதான் உங்கள் ஜாதகத்தை சரியாக பார்க்க முடியும்.`,
    telugu: `దయచేసి ${details} కూడా చెప్పండి, అప్పుడు మీ జాతకాన్ని సరిగ్గా చూడగలను.`,
    gujarati: `કૃપા કરીને ${details} પણ જણાવો, જેથી હું તમારી કુંડળી યોગ્ય રીતે જોઈ શકું.`,
    punjabi: `ਕਿਰਪਾ ਕਰਕੇ ${details} ਵੀ ਦੱਸੋ, ਤਾਂ ਜੋ ਮੈਂ ਤੁਹਾਡੀ ਕੁੰਡਲੀ ਠੀਕ ਤਰ੍ਹਾਂ ਦੇਖ ਸਕਾਂ।`,
  };

  return (
    templates[languageCode] ||
    `Please share your ${details} too, so I can read your kundli properly.`
  );
}

export function buildNumerologyMissingResponse(
  missing: string[],
  languageCode: string
) {
  const names = detailNames[languageCode] || detailNames.english;
  const details = joinDetails(
    missing.map((detail) => names[detail as DetailKey]),
    languageCode
  );

  if (languageCode === "hinglish") {
    return `Please apna ${details} share karein, taaki main numerology numbers properly calculate kar sakun.`;
  }

  const templates: Record<string, string> = {
    hindi: `कृपया अपना ${details} बताइए, ताकि मैं आपके अंक सही तरह से निकाल सकूं।`,
    bengali: `অনুগ্রহ করে আপনার ${details} জানান, যাতে আমি সংখ্যাগুলো ঠিকভাবে হিসাব করতে পারি।`,
    marathi: `कृपया तुमचे ${details} सांगा, म्हणजे मी तुमचे अंक नीट काढू शकेन.`,
    tamil: `உங்கள் ${details} பகிரவும், அப்போதுதான் எண் கணிதத்தை சரியாக கணக்கிட முடியும்.`,
    telugu: `దయచేసి మీ ${details} చెప్పండి, అప్పుడు సంఖ్యలను సరిగ్గా లెక్కించగలను.`,
    gujarati: `કૃપા કરીને તમારું ${details} જણાવો, જેથી હું અંકશાસ્ત્ર યોગ્ય રીતે ગણતરી કરી શકું.`,
    punjabi: `ਕਿਰਪਾ ਕਰਕੇ ਆਪਣਾ ${details} ਦੱਸੋ, ਤਾਂ ਜੋ ਮੈਂ ਅੰਕ ਠੀਕ ਤਰ੍ਹਾਂ ਕੱਢ ਸਕਾਂ।`,
  };

  return (
    templates[languageCode] ||
    `Please share your ${details}, so I can calculate your numerology numbers properly.`
  );
}

export function buildPalmImageMissingResponse(languageCode: string) {
  const names = detailNames[languageCode] || detailNames.english;

  if (languageCode === "hinglish") {
    return "Please apni palm ki clear photo upload karein, taaki main palm lines dekhkar reading kar sakun.";
  }

  const templates: Record<string, string> = {
    hindi: `कृपया अपनी ${names.palmImage} अपलोड कीजिए, ताकि मैं रेखाएं देखकर पढ़ सकूं।`,
    bengali: `অনুগ্রহ করে আপনার ${names.palmImage} আপলোড করুন, যাতে আমি রেখাগুলো দেখে পড়তে পারি।`,
    marathi: `कृपया तुमचा ${names.palmImage} अपलोड करा, म्हणजे मी रेषा पाहून वाचू शकेन.`,
    tamil: `உங்கள் ${names.palmImage} பதிவேற்றவும், அப்போதுதான் கோடுகளை பார்த்து படிக்க முடியும்.`,
    telugu: `దయచేసి మీ ${names.palmImage} అప్లోడ్ చేయండి, అప్పుడు రేఖలను చూసి చదవగలను.`,
    gujarati: `કૃપા કરીને તમારો ${names.palmImage} અપલોડ કરો, જેથી હું રેખાઓ જોઈને વાંચી શકું.`,
    punjabi: `ਕਿਰਪਾ ਕਰਕੇ ਆਪਣੀ ${names.palmImage} ਅਪਲੋਡ ਕਰੋ, ਤਾਂ ਜੋ ਮੈਂ ਰੇਖਾਵਾਂ ਵੇਖ ਕੇ ਪੜ੍ਹ ਸਕਾਂ।`,
  };

  return (
    templates[languageCode] ||
    "Please upload a clear palm photo so I can see your palm lines and read them properly."
  );
}

export function buildAstrologyEngineMissingResponse(languageCode: string) {
  if (languageCode === "hinglish") {
    return "Birth details mil gayi hain, lekin kundli calculation engine abhi connect nahi hai; astrology API connect hote hi main exact chart ke basis par reading de paunga.";
  }

  const templates: Record<string, string> = {
    hindi:
      "जन्म विवरण मिल गए हैं, लेकिन कुंडली calculation engine अभी connect नहीं है; astrology API connect होते ही मैं exact chart के आधार पर reading दे पाऊंगा।",
    bengali:
      "জন্মের তথ্য পেয়েছি, কিন্তু কুণ্ডলি calculation engine এখনও connect করা নেই; astrology API connect হলেই আমি exact chart-এর ভিত্তিতে reading দিতে পারব।",
    marathi:
      "जन्म तपशील मिळाले आहेत, पण कुंडली calculation engine अजून connect नाही; astrology API connect झाल्यावर मी exact chart वर आधारित reading देऊ शकेन.",
    tamil:
      "பிறந்த விவரங்கள் கிடைத்துள்ளன, ஆனால் ஜாதக calculation engine இன்னும் connect செய்யப்படவில்லை; astrology API connect ஆனதும் exact chart அடிப்படையில் reading தர முடியும்.",
    telugu:
      "పుట్టిన వివరాలు వచ్చాయి, కానీ జాతక calculation engine ఇంకా connect కాలేదు; astrology API connect అయిన వెంటనే exact chart ఆధారంగా reading ఇవ్వగలను.",
    gujarati:
      "જન્મ વિગતો મળી ગઈ છે, પરંતુ કુંડળી calculation engine હજી connect નથી; astrology API connect થતાં જ હું exact chart આધારે reading આપી શકીશ.",
    punjabi:
      "ਜਨਮ ਵੇਰਵੇ ਮਿਲ ਗਏ ਹਨ, ਪਰ ਕੁੰਡਲੀ calculation engine ਹਾਲੇ connect ਨਹੀਂ ਹੈ; astrology API connect ਹੋਣ ਤੋਂ ਬਾਅਦ ਮੈਂ exact chart ਦੇ ਆਧਾਰ ਤੇ reading ਦੇ ਸਕਾਂਗਾ।",
  };

  return (
    templates[languageCode] ||
    "Birth details are available, but the kundli calculation engine is not connected yet; once the astrology API is connected, I can read from the exact chart."
  );
}

export function buildBirthPlaceUnresolvedResponse(languageCode: string) {
  if (languageCode === "hinglish") {
    return "Birth place thoda clearly city/state/country ke saath share karein, taaki main kundli calculation sahi kar sakun.";
  }

  const templates: Record<string, string> = {
    hindi:
      "कृपया जन्म स्थान city/state/country के साथ थोड़ा स्पष्ट बताइए, ताकि मैं कुंडली calculation सही कर सकूं।",
    bengali:
      "অনুগ্রহ করে জন্মস্থান city/state/country সহ একটু পরিষ্কার করে জানান, যাতে আমি কুণ্ডলি calculation ঠিকভাবে করতে পারি।",
    marathi:
      "कृपया जन्म ठिकाण city/state/country सह थोडे स्पष्ट सांगा, म्हणजे मी कुंडली calculation योग्य करू शकेन.",
    tamil:
      "பிறந்த இடத்தை city/state/country உடன் தெளிவாக பகிரவும், அப்போதுதான் ஜாதக calculation சரியாக செய்ய முடியும்.",
    telugu:
      "దయచేసి పుట్టిన స్థలాన్ని city/state/country తో స్పష్టంగా చెప్పండి, అప్పుడు జాతక calculation సరిగ్గా చేయగలను.",
    gujarati:
      "કૃપા કરીને જન્મ સ્થળ city/state/country સાથે સ્પષ્ટ રીતે જણાવો, જેથી હું કુંડળી calculation યોગ્ય રીતે કરી શકું.",
    punjabi:
      "ਕਿਰਪਾ ਕਰਕੇ ਜਨਮ ਸਥਾਨ city/state/country ਨਾਲ ਸਪਸ਼ਟ ਦੱਸੋ, ਤਾਂ ਜੋ ਮੈਂ ਕੁੰਡਲੀ calculation ਠੀਕ ਕਰ ਸਕਾਂ।",
  };

  return (
    templates[languageCode] ||
    "Please share your birth place clearly with city, state, and country so I can calculate the kundli correctly."
  );
}

export function buildProkeralaCredentialsMissingResponse(languageCode: string) {
  if (languageCode === "hinglish") {
    return "Kundli calculation engine abhi connect nahi hua hai; Prokerala credentials add karne ke baad main exact chart ke basis par reading de paunga.";
  }

  const templates: Record<string, string> = {
    hindi:
      "कुंडली calculation engine अभी connect नहीं हुआ है; Prokerala credentials add करने के बाद मैं exact chart के आधार पर reading दे पाऊंगा।",
    bengali:
      "কুণ্ডলি calculation engine এখনও connect হয়নি; Prokerala credentials add করার পরে আমি exact chart-এর ভিত্তিতে reading দিতে পারব।",
    marathi:
      "कुंडली calculation engine अजून connect झालेले नाही; Prokerala credentials add केल्यानंतर मी exact chart वर आधारित reading देऊ शकेन.",
    tamil:
      "ஜாதக calculation engine இன்னும் connect ஆகவில்லை; Prokerala credentials add செய்த பிறகு exact chart அடிப்படையில் reading தர முடியும்.",
    telugu:
      "జాతక calculation engine ఇంకా connect కాలేదు; Prokerala credentials add చేసిన తర్వాత exact chart ఆధారంగా reading ఇవ్వగలను.",
    gujarati:
      "કુંડળી calculation engine હજી connect થયું નથી; Prokerala credentials add કર્યા પછી હું exact chart આધારે reading આપી શકીશ.",
    punjabi:
      "ਕੁੰਡਲੀ calculation engine ਹਾਲੇ connect ਨਹੀਂ ਹੋਇਆ; Prokerala credentials add ਕਰਨ ਤੋਂ ਬਾਅਦ ਮੈਂ exact chart ਦੇ ਆਧਾਰ ਤੇ reading ਦੇ ਸਕਾਂਗਾ।",
  };

  return (
    templates[languageCode] ||
    "The kundli calculation engine is not connected yet; after adding Prokerala credentials, I can read from the exact chart."
  );
}

export function buildProkeralaApiFailedResponse(languageCode: string) {
  if (languageCode === "hinglish") {
    return "Kundli calculate karte waqt thodi problem aa rahi hai, please birth details ek baar DOB, exact time aur place ke format mein dobara share karein.";
  }

  const templates: Record<string, string> = {
    hindi:
      "कुंडली calculate करते वक्त थोड़ी problem आ रही है, कृपया birth details एक बार DOB, exact time और place के format में दोबारा share करें।",
    bengali:
      "কুণ্ডলি calculate করার সময় একটু problem হচ্ছে, অনুগ্রহ করে birth details DOB, exact time এবং place format-এ আবার share করুন।",
    marathi:
      "कुंडली calculate करताना थोडी problem येत आहे, कृपया birth details DOB, exact time आणि place या format मध्ये पुन्हा share करा.",
    tamil:
      "ஜாதகத்தை calculate செய்யும்போது சிறிய problem வருகிறது, DOB, exact time மற்றும் place format-ல் birth details மீண்டும் share செய்யவும்.",
    telugu:
      "జాతకం calculate చేస్తుండగా కొంచెం problem వస్తోంది, దయచేసి DOB, exact time మరియు place format లో birth details మళ్లీ share చేయండి.",
    gujarati:
      "કુંડળી calculate કરતી વખતે થોડી problem આવી રહી છે, કૃપા કરીને DOB, exact time અને place format માં birth details ફરી share કરો.",
    punjabi:
      "ਕੁੰਡਲੀ calculate ਕਰਦੇ ਸਮੇਂ ਥੋੜ੍ਹੀ problem ਆ ਰਹੀ ਹੈ, ਕਿਰਪਾ ਕਰਕੇ DOB, exact time ਅਤੇ place format ਵਿੱਚ birth details ਦੁਬਾਰਾ share ਕਰੋ।",
  };

  return (
    templates[languageCode] ||
    "There is a problem calculating the kundli right now. Please share birth details again in DOB, exact time, and place format."
  );
}
