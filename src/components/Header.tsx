import React from 'react';
import { GraduationCap } from 'lucide-react';

export default function Header() {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 sm:h-20">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="bg-blue-900 p-2 sm:p-2.5 rounded-xl sm:rounded-2xl shadow-md">
              <GraduationCap className="text-white h-5 w-5 sm:h-7 sm:w-7" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-base sm:text-xl font-black text-blue-900 tracking-tight leading-none mb-0.5 sm:mb-1 font-display">
                VTU Intelligence Core
              </h1>
              <span className="text-[7px] sm:text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] sm:tracking-[0.3em]">
                Academic Concierge
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-4 sm:gap-8">
            <nav className="hidden md:flex items-center gap-6">
              <a href="#" className="text-[10px] font-black text-slate-500 hover:text-blue-900 uppercase tracking-widest transition-colors">Admissions</a>
              <a href="#" className="text-[10px] font-black text-slate-500 hover:text-blue-900 uppercase tracking-widest transition-colors">Research</a>
              <a href="#" className="text-[10px] font-black text-slate-500 hover:text-blue-900 uppercase tracking-widest transition-colors">Academics</a>
              <a href="#" className="text-[10px] font-black text-slate-500 hover:text-blue-900 uppercase tracking-widest transition-colors">Contact</a>
            </nav>
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest">Official Support</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
