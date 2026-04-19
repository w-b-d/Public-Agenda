type HeroProps = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
};

export default function Hero({
  eyebrow = 'The Sovereign Archive',
  title = 'Public Agenda',
  subtitle = 'Access immutable public records and legislative agendas with prestige editorial clarity.',
}: HeroProps) {
  return (
    <section className="py-12 md:py-16 flex flex-col items-center text-center">
      <span className="text-[12px] uppercase tracking-[0.3em] font-bold text-on-surface-variant/80 mb-8 block">
        {eyebrow}
      </span>

      <h1 className="text-5xl md:text-7xl font-black text-primary tracking-tighter-mega mb-6 leading-none">
        {title}
      </h1>

      <p className="text-lg md:text-xl text-on-surface-variant/70 font-light max-w-2xl mx-auto leading-relaxed">
        {subtitle}
      </p>
    </section>
  );
}