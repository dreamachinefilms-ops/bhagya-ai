import ServicePage from "@/components/ServicePage";

export default function NumerologyPage() {
  return (
    <ServicePage
      icon="🔢"
      title="Numerology"
      subtitle="AI Numerology Reading"
      description="Discover your life path number, destiny number, lucky number, personal year, and name vibration using AI-powered numerology guidance."
      fields={[
        {
          label: "Full Name",
          placeholder: "Enter your full name",
        },
        {
          label: "Date of Birth",
          placeholder: "Select your date of birth",
          type: "date",
        },
      ]}
      features={[
        "Life Path Number",
        "Lucky Number",
        "Name Vibration",
        "Personal Year Guidance",
      ]}
      examples={[
        "What is my lucky number?",
        "Is my name suitable for success?",
        "How will this year be for me?",
      ]}
      buttonText="Generate Numerology Reading"
      accentFrom="#FF8A00"
      accentTo="#FFC400"
    />
  );
} 