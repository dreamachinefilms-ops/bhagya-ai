import { redirect } from "next/navigation";

export default function LegacyLoveHoroscopePage() {
  redirect("/horoscope/daily");
}
