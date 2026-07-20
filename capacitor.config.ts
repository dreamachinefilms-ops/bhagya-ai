import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dreamachinefilms.bhagya",
  appName: "Bhagya",
  webDir: "out",
  server: {
    url: "https://bhagya-ai.vercel.app",
    cleartext: false
  },
  android: {
    backgroundColor: "#020817"
  }
};

export default config;
