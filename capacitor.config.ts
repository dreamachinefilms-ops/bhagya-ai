import type { CapacitorConfig } from "@capacitor/cli";

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL || "https://your-production-domain.com";

const config: CapacitorConfig = {
  appId: "com.dreamachinefilms.bhagya",
  appName: "Bhagya.ai",
  webDir: "out",
  server: {
    url: appUrl,
    cleartext: false,
  },
  android: {
    backgroundColor: "#020817",
  },
};

export default config;
