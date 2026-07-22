import PublicPageShell from "@/components/layout/PublicPageShell";
import ContactForm from "@/components/features/ContactForm";

export default function ContactPage() {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  return <PublicPageShell><div className="mx-auto max-w-2xl"><h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">Contact Us</h1><p className="mt-5 text-lg leading-8 text-white/50">Questions, feedback or account support? Send a message securely to the Bhagya team.</p>{supportEmail && <p className="mt-4 text-sm text-white/50">Support: <a className="text-sky-300 hover:underline" href={`mailto:${supportEmail}`}>{supportEmail}</a></p>}<ContactForm /></div></PublicPageShell>;
}
