import { motion } from 'motion/react';

export default function Newsletter() {
  return (
    <section className="mt-32 relative overflow-hidden bg-primary p-12 md:p-20 rounded-2xl mx-4 md:mx-0">
      {/* Background patterns could go here */}
      <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
        <img 
          className="w-full h-full object-cover" 
          src="https://picsum.photos/seed/civic/1000/1000?grayscale" 
          alt="Civic backdrop"
          referrerPolicy="no-referrer"
        />
      </div>
      
      <div className="relative z-10 max-w-xl">
        <h3 className="text-4xl md:text-5xl font-black text-on-primary tracking-tighter mb-6">
          Stay informed. Stay involved.
        </h3>
        <p className="text-on-primary/70 text-lg mb-8 leading-relaxed">
          Receive the weekly Public Agenda direct to your inbox. A curated summary of decisions that shape our community.
        </p>
        
        <form className="flex flex-col sm:flex-row gap-4" onSubmit={(e) => e.preventDefault()}>
          <input 
            className="bg-white/10 border-0 border-b border-white/30 text-white placeholder:text-white/40 focus:ring-0 focus:border-white transition-all py-4 px-4 flex-1 outline-none" 
            placeholder="email@address.gov" 
            type="email" 
          />
          <button className="bg-white text-primary font-black uppercase tracking-widest px-8 py-4 text-sm hover:bg-surface-container transition-colors rounded-sm active:scale-95">
            Subscribe
          </button>
        </form>
      </div>
    </section>
  );
}
