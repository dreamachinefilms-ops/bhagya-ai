import ServicePage from "@/components/ServicePage";

export default function TarotPage() {
  return (
    <ServicePage
      icon="🃏"
      title="Tarot"
      subtitle="AI Tarot Reading"
      description="Ask a question and receive an AI tarot-style reading for love, career, money, relationships, and personal decisions."
      fields={[
        {
          label: "Your Question",
          placeholder: "Example: Will my career improve this year?",
        },
        {
          label: "Reading Type",
          placeholder: "Love, Career, Money, Relationship, General",
        },
      ]}
      features={[
        "Love Reading",
        "Career Reading",
        "Money Guidance",
        "Decision Support",
      ]}
      examples={[
        "Should I change my job?",
        "What is coming in my love life?",
        "Is this a good time for business?",
      ]}
      buttonText="Start Tarot Reading"
      accentFrom="#F857A6"
      accentTo="#8A2BE2"
    />
  );
}