import Link from "next/link";
import BhagyaLogo from "@/components/branding/BhagyaLogo";

type Field = {
  label: string;
  placeholder: string;
  type?: string;
};

type ServicePageProps = {
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  fields: Field[];
  features: string[];
  examples: string[];
  buttonText: string;
  accentFrom: string;
  accentTo: string;
};

export default function ServicePage({
  icon,
  title,
  subtitle,
  description,
  fields,
  features,
  examples,
  buttonText,
  accentFrom,
  accentTo,
}: ServicePageProps) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-[#FFF7D6] via-[#FFE9F3] to-[#EAD7FF] px-6 py-8 text-[#2B124C]">
      <header className="mx-auto flex max-w-7xl items-center justify-between rounded-full border border-white/70 bg-white/65 px-5 py-4 shadow-lg backdrop-blur-md">
        <Link href="/" className="flex items-center gap-3">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full text-xl shadow-md"
            style={{
              background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})`,
            }}
          >
            <BhagyaLogo size={31} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Bhagya.ai</h2>
            <p className="text-xs font-medium text-[#7B4E00]">
              AI Spiritual Guidance
            </p>
          </div>
        </Link>

        <Link
          href="/"
          className="rounded-full bg-white px-5 py-3 text-sm font-bold text-[#4B177A] shadow-md transition hover:bg-yellow-50"
        >
          Back Home
        </Link>
      </header>

      <section className="mx-auto grid max-w-7xl gap-10 py-16 lg:grid-cols-2 lg:items-center">
        <div>
          <div className="mb-6 inline-flex rounded-full border border-white/80 bg-white/70 px-5 py-2 text-sm font-bold text-orange-700 shadow-sm">
            {subtitle}
          </div>

          <h1 className="text-5xl font-extrabold leading-tight md:text-7xl">
            <span className="mr-3">{icon}</span>
            {title}
          </h1>

          <p className="mt-6 max-w-2xl text-xl font-medium leading-relaxed text-[#5B3A73]">
            {description}
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature}
                className="rounded-2xl border border-white/70 bg-white/60 p-5 font-semibold shadow-md"
              >
                {feature}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[2rem] border border-white/80 bg-white/75 p-7 shadow-2xl backdrop-blur-md">
          <h2 className="text-3xl font-extrabold">Start Your Reading</h2>
          <p className="mt-2 font-medium text-[#6A4B7E]">
            Enter your details below. AI result connection will be added in the
            next step.
          </p>

          <form className="mt-7 space-y-5">
            {fields.map((field) => (
              <div key={field.label}>
                <label className="mb-2 block font-bold text-[#2B124C]">
                  {field.label}
                </label>
                <input
                  type={field.type || "text"}
                  placeholder={field.placeholder}
                  className="w-full rounded-2xl border border-purple-100 bg-white px-5 py-4 text-base font-medium outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
                />
              </div>
            ))}

            <button
              type="button"
              className="w-full rounded-full px-8 py-4 text-lg font-extrabold text-white shadow-xl transition hover:scale-[1.02]"
              style={{
                background: `linear-gradient(135deg, ${accentFrom}, ${accentTo})`,
              }}
            >
              {buttonText}
            </button>
          </form>
        </div>
      </section>

      <section className="mx-auto max-w-7xl pb-16">
        <div className="rounded-[2rem] border border-white/80 bg-white/60 p-7 shadow-xl backdrop-blur-md">
          <h2 className="text-3xl font-extrabold">You can ask about</h2>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {examples.map((example) => (
              <div
                key={example}
                className="rounded-2xl bg-white/80 p-5 font-semibold text-[#5B3A73] shadow-sm"
              >
                “{example}”
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
