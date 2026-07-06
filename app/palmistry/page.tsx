import ServicePage from "@/components/ServicePage";

export default function PalmistryPage() {
  return (
    <ServicePage
      icon="✋"
      title="Palmistry"
      subtitle="AI Palm Reading"
      description="Upload your palm image and get AI-based palmistry insights about personality, career, love, health tendencies, and life direction."
      fields={[
        {
          label: "Your Name",
          placeholder: "Enter your name",
        },
        {
          label: "Upload Palm Image",
          placeholder: "Upload palm image",
          type: "file",
        },
      ]}
      features={[
        "Life Line Reading",
        "Heart Line Reading",
        "Career Indications",
        "Personality Insights",
      ]}
      examples={[
        "What does my palm say about career?",
        "What does my heart line show?",
        "What are my personality strengths?",
      ]}
      buttonText="Read My Palm"
      accentFrom="#8A2BE2"
      accentTo="#4F46E5"
    />
  );
}