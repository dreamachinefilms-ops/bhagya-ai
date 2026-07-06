import ServicePage from "@/components/ServicePage";

export default function AstrologyPage() {
  return (
    <ServicePage
      icon="✨"
      title="Astrology"
      subtitle="AI Astrology & Kundli Guidance"
      description="Generate AI-based astrology insights using your birth details, including kundli, rashi, nakshatra, horoscope, marriage, career, and compatibility guidance."
      fields={[
        {
          label: "Date of Birth",
          placeholder: "Select your date of birth",
          type: "date",
        },
        {
          label: "Time of Birth",
          placeholder: "Select your time of birth",
          type: "time",
        },
        {
          label: "Birth Place",
          placeholder: "Example: Delhi, India",
        },
      ]}
      features={[
        "Kundli Guidance",
        "Daily Horoscope",
        "Marriage Insights",
        "Career Predictions",
      ]}
      examples={[
        "When will I get married?",
        "How will my career grow?",
        "Is this year good for business?",
      ]}
      buttonText="Generate Astrology Reading"
      accentFrom="#FF6A00"
      accentTo="#FF3D71"
    />
  );
}