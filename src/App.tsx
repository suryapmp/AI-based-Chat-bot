import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import ChatInterface from './components/ChatInterface';
import DeployedChat from './components/DeployedChat';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, GraduationCap, ExternalLink } from 'lucide-react';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/deploy" element={<DeployedChat />} />
      </Routes>
    </Router>
  );
}

function Home() {
  const [isChatOpen, setIsChatOpen] = useState(false);

  return (
    <div className="min-h-screen bg-transparent font-sans text-vtu-text-main selection:bg-vtu-accent/20 selection:text-vtu-accent flex flex-col relative overflow-hidden">
      {/* Link to Deployed Version */}
      <div className="fixed top-6 right-6 z-[100]">
        <Link 
          to="/deploy" 
          className="bg-vtu-accent text-white px-4 py-2 rounded-xl shadow-lg font-black text-[10px] uppercase tracking-widest flex items-center gap-2 hover:bg-vtu-accent-hover transition-all"
        >
          <ExternalLink size={14} /> Deployed Version
        </Link>
      </div>

      {/* Floating Chat Widget */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-4">
        <AnimatePresence>
          {isChatOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95, transformOrigin: 'bottom right' }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="w-[calc(100vw-48px)] sm:w-[450px] h-[600px] max-h-[calc(100vh-120px)] bg-vtu-surface rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.15)] border border-vtu-border overflow-hidden flex flex-col"
            >
              <div className="bg-vtu-surface p-4 flex items-center justify-between text-vtu-text-main border-b border-vtu-border shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-vtu-accent/10 p-2 rounded-xl text-vtu-accent">
                    <GraduationCap size={20} />
                  </div>
                  <div>
                    <h3 className="font-black text-sm tracking-tight">VTU Intelligence</h3>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-vtu-text-dim">Online Support</span>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => setIsChatOpen(false)}
                  className="p-2 hover:bg-vtu-bg rounded-xl transition-all text-vtu-text-dim hover:text-vtu-text-main"
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
              className="bg-vtu-surface px-4 py-2 rounded-2xl shadow-xl border border-vtu-border hidden sm:block"
            >
              <p className="text-xs font-black text-vtu-accent uppercase tracking-widest">Hi! How can I help?</p>
            </motion.div>
          )}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 relative border border-vtu-border",
              isChatOpen ? "bg-white text-vtu-accent rotate-90" : "bg-vtu-accent text-white"
            )}
          >
            {isChatOpen ? <X size={28} /> : <MessageCircle size={28} />}
            {!isChatOpen && (
              <div className="absolute -top-1 -left-1 bg-vtu-accent text-white text-[10px] font-black px-2 py-0.5 rounded-full animate-bounce shadow-lg border-2 border-white">
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
