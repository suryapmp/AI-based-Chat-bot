import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Send, Paperclip, User, Bot, Trash2, FileText, Eye, 
  Copy, Check, BookOpen, GraduationCap, Globe
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import PDFModal from './PDFModal';

const SYSTEM_PROMPT = `Advanced System Prompt: VTU Intelligence Core (Deployment Version)
1. IDENTITY & GOAL: You are VTU Intelligence, the official AI academic concierge for Visvesvaraya Technological University (VTU).
2. KNOWLEDGE: Use provided PDFs for Syllabus and CBCS Regulations. 
3. LOGIC: Follow Manual/Batch Enrollment rules for Backlogs (ATKT).
4. CLOSURE: Always ask: "I have recorded this conversation. Would you like me to send this transcript to your university email for your official reference?"`;

interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  image?: string;
  pdf?: { name: string; url: string; };
  timestamp: Date;
}

export default function DeployedChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ type: 'image' | 'pdf', data: string, name: string } | null>(null);
  const [viewingPdf, setViewingPdf] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(() => { scrollToBottom(); }, [messages]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedFile({
          type: file.type.startsWith('image/') ? 'image' : 'pdf',
          data: reader.result as string,
          name: file.name
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !selectedFile) return;

    // --- UPDATED KEY RETRIEVAL LOGIC ---
    // This checks all common React/Next/Vite prefixes
    const OPENROUTER_API_KEY = 
      process.env.NEXT_PUBLIC_OPENROUTER_API_KEY || 
      process.env.VITE_OPENROUTER_API_KEY || 
      process.env.OPENROUTER_API_KEY;

    const userMessage: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: input,
      image: selectedFile?.type === 'image' ? selectedFile.data : undefined,
      pdf: selectedFile?.type === 'pdf' ? { name: selectedFile.name, url: selectedFile.data } : undefined,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSelectedFile(null);
    setIsLoading(true);
    
    const botMessageId = Math.random().toString(36).substring(7);
    setMessages(prev => [...prev, { id: botMessageId, role: 'bot', content: '', timestamp: new Date() }]);

    try {
      if (!OPENROUTER_API_KEY) {
        throw new Error("KEY_MISSING: Ensure 'NEXT_PUBLIC_OPENROUTER_API_KEY' is set in Netlify and 'Clear Cache and Deploy' was used.");
      }

      const history = messages.slice(-6).map(msg => ({
        role: msg.role === 'bot' ? 'assistant' : 'user',
        content: msg.content || "User sent an attachment."
      }));

      let currentContent: any = input || "Analyze the attached content.";
      if (userMessage.image) {
        currentContent = [
          { type: "text", text: input || "Analyze this image for VTU info." },
          { type: "image_url", image_url: { url: userMessage.image } }
        ];
      }

      const makeRequest = async (modelId: string) => {
        return await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": window.location.origin,
            "X-Title": "VTU Intelligence Core",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            "model": modelId,
            "messages": [
              { "role": "system", "content": SYSTEM_PROMPT },
              ...history,
              { "role": "user", "content": currentContent }
            ]
          })
        });
      };

      // TIERED FALLBACK
      let response = await makeRequest("google/gemma-3-27b-it:free");
      let data = await response.json();

      if (!response.ok) {
        response = await makeRequest("google/gemma-2-9b-it:free");
        data = await response.json();
      }

      if (!response.ok) throw new Error(data.error?.message || "Auth Error");

      setMessages(prev => prev.map(m => 
        m.id === botMessageId ? { ...m, content: data.choices[0].message.content } : m
      ));

    } catch (error: any) {
      setMessages(prev => prev.map(m => 
        m.id === botMessageId ? { ...m, content: `⚠️ **System Error:** ${error.message}` } : m
      ));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white overflow-hidden relative font-sans">
      {viewingPdf && <PDFModal fileUrl={viewingPdf} onClose={() => setViewingPdf(null)} />}

      {/* Header */}
      <div className="bg-blue-900 text-white px-6 py-4 flex items-center justify-between shrink-0 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="bg-white/10 p-2 rounded-xl"><GraduationCap size={24} /></div>
          <div>
            <h3 className="font-black text-lg tracking-tight">VTU Intelligence Core</h3>
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-200">Official CNC Deployment</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <QuickLink icon={<Globe size={14} />} label="Results" href="https://results.vtu.ac.in" />
          <QuickLink icon={<BookOpen size={14} />} label="Syllabus" href="https://vtu.ac.in/en/b-e-scheme-syllabus/" />
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 bg-[#FDFEFF]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-12">
            <div className="bg-blue-600 rounded-[32px] p-8 shadow-2xl text-white">
              <GraduationCap size={40} />
            </div>
            <h3 className="font-black text-slate-900 text-3xl tracking-tight">Academic Portal Active</h3>
            <p className="text-slate-500 max-w-sm mx-auto font-medium">Ask about backlogs, CBCS regulations, or upload a syllabus PDF.</p>
          </div>
        )}
        
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className={cn("flex w-full gap-4 max-w-5xl mx-auto", msg.role === 'user' ? "flex-row-reverse" : "flex-row")}>
              <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border", 
                msg.role === 'user' ? "bg-blue-50 border-blue-100" : "bg-white border-slate-200")}>
                {msg.role === 'user' ? <User size={20} className="text-blue-600" /> : <Bot size={20} className="text-blue-600" />}
              </div>
              
              <div className={cn("flex-1 space-y-2", msg.role === 'user' ? "text-right" : "text-left")}>
                <div className={cn("inline-block rounded-2xl p-4 sm:p-6 shadow-sm border text-left",
                  msg.role === 'user' ? "bg-blue-600 text-white border-blue-500" : "bg-white text-slate-800 border-slate-100")}>
                  
                  {msg.image && <img src={msg.image} className="max-w-xs rounded-lg mb-4 border-2 border-white/20 shadow-lg" alt="User upload" />}
                  
                  {msg.pdf && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <FileText className="text-red-600" />
                        <span className="text-xs font-bold text-slate-900 truncate max-w-[150px]">{msg.pdf.name}</span>
                      </div>
                      <button onClick={() => setViewingPdf(msg.pdf!.url)} className="px-3 py-1 bg-blue-600 text-white rounded-md text-[10px] font-bold">VIEW</button>
                    </div>
                  )}

                  <div className="prose prose-sm max-w-none prose-blue">
                    <ReactMarkdown components={{
                      code({ inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                          <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" className="rounded-xl !bg-slate-900 !p-4" {...props}>
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : <code className="bg-blue-100 text-blue-900 px-1 rounded" {...props}>{children}</code>;
                      }
                    }}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 sm:p-6 bg-white border-t border-slate-100">
        {selectedFile && (
          <div className="mb-4 relative inline-block">
            <div className="h-20 w-20 bg-slate-100 rounded-lg border-2 border-blue-400 flex items-center justify-center overflow-hidden">
               {selectedFile.type === 'image' ? <img src={selectedFile.data} className="object-cover h-full w-full" alt="Preview" /> : <FileText className="text-red-500" />}
            </div>
            <button onClick={() => setSelectedFile(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg"><Trash2 size={12} /></button>
          </div>
        )}
        <div className="flex items-end gap-3 max-w-5xl mx-auto">
          <button onClick={() => fileInputRef.current?.click()} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-slate-400 hover:text-blue-600 transition-all">
            <Paperclip size={24} />
          </button>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*,.pdf" className="hidden" />
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
              placeholder="Query VTU Intelligence..."
              className="w-full p-4 pr-14 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-50 focus:border-blue-400 focus:outline-none resize-none bg-white font-medium text-slate-800"
              rows={1}
            />
            <button onClick={handleSend} disabled={isLoading || (!input.trim() && !selectedFile)} className="absolute right-2 bottom-2 p-3 bg-blue-600 text-white rounded-xl hover:bg-black transition-all shadow-lg disabled:opacity-30">
              <Send size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ icon, label, href }: { icon: React.ReactNode, label: string, href: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all">
      {icon}
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </a>
  );
}
