import React, { useState } from 'react';
import ChatInterface from './components/ChatInterface';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, GraduationCap } from 'lucide-react';

export default function App() {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50/50 font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900 flex flex-col relative overflow-hidden">
      {/* Floating Chat Widget */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-4">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95, transformOrigin: 'bottom right' }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="w-[calc(100vw-48px)] sm:w-[450px] h-[600px] max-h-[calc(100vh-120px)] bg-white rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-slate-200 overflow-hidden flex flex-col"
            >
              <div className="bg-blue-900 p-4 flex items-center justify-between text-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-white/10 p-2 rounded-xl">
                    <GraduationCap size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-sm tracking-tight">VTU Intelligence</h3>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-blue-200">Online Support</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setIsChatOpen(false)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-all"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatInterface isWidget={true} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center gap-3">
          {!isChatOpen && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white px-4 py-2 rounded-2xl shadow-xl border border-slate-100 hidden sm:block"
            >
              <p className="text-xs font-black text-blue-900 uppercase tracking-widest">Hi! How can I help?</p>
            </motion.div>
          )}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 relative",
              isChatOpen ? "bg-white text-blue-900 border-2 border-blue-900 rotate-90" : "bg-blue-900 text-white"
            )}
          >
            {isChatOpen ? <X size={28} /> : <MessageCircle size={28} />}
            {!isChatOpen && (
              <div className="absolute -top-1 -left-1 bg-red-500 text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce shadow-lg border-2 border-white">
                1
              </div>
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
