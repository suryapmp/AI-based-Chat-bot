import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Send, Paperclip, User, Bot, Trash2, Mail, FileText, Eye, 
  Search, Copy, Check, ExternalLink, 
  BookOpen, Code, Info, GraduationCap, ClipboardList, Globe
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import PDFModal from './PDFModal';

const SYSTEM_PROMPT = `Advanced System Prompt: VTU Intelligence Core (Deployment Version)
1. IDENTITY & GOAL
You are VTU Intelligence, the official AI academic concierge for Visvesvaraya Technological University (VTU). Your goal is to provide 100% accurate information regarding syllabus, exam regulations, backlog (ATKT) systems, and university circulars.

2. KNOWLEDGE RETRIEVAL & GROUNDING
Primary Source: Use the provided PDF documents (Syllabus, CBCS Regulations, Exam Manuals).
Verification Rule: If a student asks about a "2026 Circular," search the live site first. Do not hallucinate dates or rules. If the information is not on the site or in your files, state: "I cannot find an official record of this. Please check the CNC department notice board."

3. ADVANCED FEATURES & LOGIC
Backlog/ATKT Logic: When a student mentions a "Backlog," strictly follow the Manual/Batch Enrollment rules. Remind them that they remain enrolled until they pass and the subject carries forward.
Examination Focus: Prioritize accurate information for examination schedules, results, revaluation processes, and hall ticket queries.
Multilingual Support: Default to English, but if a student asks in Kannada, respond fluently in Kannada while maintaining technical accuracy for course codes.

4. OUTPUT FORMATTING (University Standard)
Structured Data: Use Markdown Tables for exam schedules or mark distributions.
Clarity: Use Bold for Unique Course Codes and Credits.
Tone: Professional, supportive, and grounded.

5. TRANSACTIONAL CLOSURE
At the end of every significant query resolution, you MUST include this standard closing:
"I have recorded this conversation. Would you like me to send this transcript to your university email for your official reference?"`;

interface Message {
  id: string;
  role: 'user' | 'bot';
  content: string;
  image?: string;
  pdf?: {
    name: string;
    url: string;
  };
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const type = file.type.startsWith('image/') ? 'image' : 'pdf';
        setSelectedFile({
          type,
          data: reader.result as string,
          name: file.name
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSend = async () => {
    if (!input.trim() && !selectedFile) return;

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
    const initialBotMessage: Message = {
      id: botMessageId,
      role: 'bot',
      content: '',
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, initialBotMessage]);

    try {
      // Use the environment variable. Hardcoded key removed for security on GitHub/Netlify.
      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
      
      if (!OPENROUTER_API_KEY) {
        throw new Error("OpenRouter API Key is missing. Please set OPENROUTER_API_KEY in your deployment environment (Netlify/Vercel).");
      }
      
      const history = messages.slice(-10).map(msg => ({
        role: msg.role === 'bot' ? 'assistant' : 'user',
        content: msg.content || (msg.image ? "User sent an image." : "User sent a document.")
      }));

      let currentContent: any;
      
      if (userMessage.image) {
        currentContent = [
          { type: "text", text: input || "Analyze the attached content and provide VTU related information." },
          { type: "image_url", image_url: { url: userMessage.image } }
        ];
      } else {
        currentContent = input || "Analyze the attached content.";
        if (userMessage.pdf) {
          currentContent += ` [SYSTEM: User has attached a PDF document named "${userMessage.pdf.name}".]`;
        }
      }

      const makeRequest = async (modelId: string) => {
        return await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
            "HTTP-Referer": window.location.origin,
            "X-Title": "VTU Intelligence Core (Deployed)",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            "model": modelId,
            "messages": [
              { "role": "system", "content": SYSTEM_PROMPT },
              ...history,
              { "role": "user", "content": currentContent }
            ],
            "route": "fallback"
          })
        });
      };

      let response = await makeRequest("openai/gpt-oss-120b:free");
      let data = await response.json();

      // Multi-tier fallback system for maximum reliability
      if (!response.ok || (data.error?.message?.includes("Provider returned error")) || (data.error?.message?.includes("No endpoints found"))) {
        console.warn("Primary model (GPT-OSS 120B) failed, trying fallback 1 (Gemma 3)...");
        response = await makeRequest("google/gemma-3-27b-it:free");
        data = await response.json();
        
        if (!response.ok || (data.error?.message?.includes("Provider returned error")) || (data.error?.message?.includes("No endpoints found"))) {
          console.warn("Fallback 1 failed, trying fallback 2 (Gemma 2 9B)...");
          response = await makeRequest("google/gemma-2-9b-it:free");
          data = await response.json();
        }
      }

      if (!response.ok) {
        console.error("OpenRouter Error Data:", data);
        const errorMsg = data.error?.message || `OpenRouter Error: ${response.status}`;
        throw new Error(errorMsg);
      }

      const botResponse = data.choices[0].message.content;
      setMessages(prev => prev.map(m => 
        m.id === botMessageId ? { ...m, content: botResponse } : m
      ));

    } catch (error: any) {
      console.error("Error in deployed chat flow:", error);
      const errorMessage = `Connection Error: ${error.message}. Please ensure your OpenRouter API key is valid.`;
      setMessages(prev => prev.map(m => 
        m.id === botMessageId ? { ...m, content: errorMessage } : m
      ));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white overflow-hidden relative">
      {/* PDF Modal */}
      {viewingPdf && <PDFModal fileUrl={viewingPdf} onClose={() => setViewingPdf(null)} />}

      {/* Top Bar */}
      <div className="bg-blue-900 text-white px-6 py-4 flex items-center justify-between shrink-0 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="bg-white/10 p-2 rounded-xl">
            <GraduationCap size={24} />
          </div>
          <div>
            <h3 className="font-black text-lg tracking-tight">VTU Intelligence Core</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-200">Deployed Version (OpenRouter)</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <QuickLink icon={<Globe size={14} />} label="Results" href="https://results.vtu.ac.in" />
          <QuickLink icon={<BookOpen size={14} />} label="Syllabus" href="https://vtu.ac.in/en/b-e-scheme-syllabus/" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6 bg-[#FDFEFF]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-8 max-w-3xl mx-auto py-12">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-blue-600 rounded-[48px] shadow-2xl p-10"
            >
              <GraduationCap className="text-white" size={48} />
            </motion.div>
            <div className="space-y-2">
              <h3 className="font-black text-slate-900 text-3xl sm:text-5xl tracking-tight font-display">Welcome Student</h3>
              <p className="text-slate-500 font-medium text-sm sm:text-xl max-w-xl mx-auto">
                This is the dedicated deployment version of VTU Intelligence Core.
              </p>
            </div>
          </div>
        )}
        
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex w-full gap-3 sm:gap-6 max-w-5xl mx-auto",
                msg.role === 'user' ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div className={cn(
                "w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 shadow-sm border",
                msg.role === 'user' ? "bg-blue-50 border-blue-100" : "bg-white border-slate-200"
              )}>
                {msg.role === 'user' ? <User size={16} className="text-blue-600 sm:w-6 sm:h-6" /> : <Bot size={16} className="text-blue-600 sm:w-6 sm:h-6" />}
              </div>
              
              <div className={cn(
                "flex-1 space-y-2",
                msg.role === 'user' ? "text-right" : "text-left"
              )}>
                <div className={cn(
                  "inline-block rounded-2xl sm:rounded-[28px] p-4 sm:p-6 shadow-sm border text-left",
                  msg.role === 'user' 
                    ? "bg-blue-600 text-white rounded-tr-none border-blue-500 font-semibold" 
                    : "bg-white text-slate-800 rounded-tl-none border-slate-100"
                )}>
                  {msg.image && (
                    <img 
                      src={msg.image} 
                      alt="Uploaded content" 
                      className="max-w-full h-48 sm:h-80 object-cover rounded-xl sm:rounded-2xl mb-4 sm:mb-6 border-2 sm:border-4 border-white/10 shadow-2xl"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  
                  {msg.pdf && (
                    <div className="mb-4 sm:mb-6 p-3 sm:p-5 bg-blue-50 rounded-xl sm:rounded-2xl border border-blue-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-6">
                      <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
                        <div className="bg-red-50 p-2 sm:p-3 rounded-lg sm:rounded-xl">
                          <FileText className="text-red-600 w-5 h-5 sm:w-7 sm:h-7" />
                        </div>
                        <div className="overflow-hidden">
                          <p className="text-sm sm:text-base font-black text-slate-900 truncate">{msg.pdf.name}</p>
                          <p className="text-[8px] sm:text-[10px] text-blue-500 font-black uppercase tracking-widest">Official VTU Document</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setViewingPdf(msg.pdf!.url)}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-blue-600 text-white rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black hover:bg-black transition-all shadow-xl shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> VIEW
                      </button>
                    </div>
                  )}

                  <div className="markdown-container prose prose-slate prose-sm sm:prose-base max-w-none prose-blue leading-relaxed">
                    <ReactMarkdown
                      components={{
                        code({ node, inline, className, children, ...props }: any) {
                          const match = /language-(\w+)/.exec(className || '');
                          return !inline && match ? (
                            <div className="relative group my-4 sm:my-6">
                              <div className="absolute right-2 top-2 sm:right-4 sm:top-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => copyToClipboard(String(children), msg.id)}
                                  className="p-1.5 sm:p-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 border border-slate-700"
                                >
                                  {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                                </button>
                              </div>
                              <SyntaxHighlighter
                                style={vscDarkPlus}
                                language={match[1]}
                                PreTag="div"
                                className="rounded-xl sm:rounded-2xl !bg-slate-900 !p-4 sm:!p-6 border border-slate-800 shadow-2xl overflow-x-auto"
                                {...props}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            </div>
                          ) : (
                            <code className={cn("bg-blue-50 text-blue-900 px-1 py-0.5 rounded font-mono text-[10px] sm:text-sm", className)} {...props}>
                              {children}
                            </code>
                          );
                        },
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-4 sm:my-8 rounded-xl sm:rounded-2xl border border-slate-200 shadow-xl bg-white">
                            <table className="min-w-full border-collapse">
                              {children}
                            </table>
                          </div>
                        ),
                        thead: ({ children }) => <thead className="bg-slate-50 border-b border-slate-200">{children}</thead>,
                        th: ({ children }) => <th className="px-3 py-2 sm:px-6 sm:py-4 text-left text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{children}</th>,
                        tr: ({ children }) => <tr className="hover:bg-slate-50 transition-colors">{children}</tr>,
                        td: ({ children }) => <td className="px-3 py-2 sm:px-6 sm:py-4 text-[10px] sm:text-sm text-slate-600 border-t border-slate-100 font-medium">{children}</td>,
                        strong: ({ children }) => <strong className="text-slate-900 font-black">{children}</strong>,
                        h1: ({ children }) => <h1 className="text-xl sm:text-2xl font-black text-slate-900 mb-3 sm:mb-4 tracking-tight font-display">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-lg sm:text-xl font-black text-slate-900 mb-2 sm:mb-3 tracking-tight font-display">{children}</h2>,
                        p: ({ children }) => <p className="mb-3 sm:mb-4 text-slate-600 font-medium leading-relaxed text-sm sm:text-base">{children}</p>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4">
                  <p className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {msg.role === 'user' ? 'Student Query' : 'Intelligence Core'}
                  </p>
                  <span className="w-1 h-1 bg-slate-300 rounded-full" />
                  <p className="text-[8px] sm:text-[10px] font-bold text-slate-300">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && !messages[messages.length - 1]?.content && (
          <div className="flex gap-3 sm:gap-6 max-w-5xl mx-auto">
            <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-lg">
              <Bot size={16} className="text-blue-600 sm:w-6 sm:h-6" />
            </div>
            <div className="bg-white rounded-2xl sm:rounded-[28px] p-4 sm:p-6 rounded-tl-none border border-slate-100 flex items-center gap-3 sm:gap-4 shadow-sm">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <motion.div 
                    key={i}
                    animate={{ y: [0, -6, 0] }} 
                    transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                    className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-blue-600 rounded-full" 
                  />
                ))}
              </div>
              <span className="text-[10px] sm:text-xs text-blue-600 font-black uppercase tracking-widest">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 sm:p-8 bg-white border-t border-slate-100 shadow-[0_-20px_60px_rgba(0,0,0,0.02)]">
        {selectedFile && (
          <div className="relative inline-block group mb-4 sm:mb-6">
            {selectedFile.type === 'image' ? (
              <img 
                src={selectedFile.data} 
                alt="Preview" 
                className="h-20 w-20 sm:h-32 sm:w-32 object-cover rounded-xl border-2 sm:border-4 border-blue-400 shadow-2xl"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-20 w-20 sm:h-32 sm:w-32 bg-red-50 rounded-xl border-2 sm:border-4 border-red-400 shadow-2xl flex flex-col items-center justify-center text-center p-2 sm:p-4">
                <FileText className="text-red-600 mb-1 w-4 h-4 sm:w-8 sm:h-8" />
                <p className="text-[6px] sm:text-[10px] font-black text-red-900 truncate w-full">{selectedFile.name}</p>
              </div>
            )}
            <button 
              onClick={clearFile}
              className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 shadow-2xl hover:bg-red-600 transition-all"
            >
              <Trash2 className="w-2 h-2 sm:w-4 sm:h-4" />
            </button>
          </div>
        )}
        
        <div className="flex items-end gap-2 max-w-5xl mx-auto">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="p-3 sm:p-5 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm group shrink-0"
            title="Attach Document (PDF/Image)"
          >
            <Paperclip className="w-5 h-5 sm:w-7 sm:h-7 group-hover:rotate-12 transition-transform" />
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            accept="image/*,.pdf" 
            className="hidden" 
          />
          
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a message..."
              className="w-full p-3 sm:p-5 pr-12 sm:pr-20 rounded-2xl sm:rounded-3xl border border-slate-200 focus:ring-4 sm:focus:ring-8 focus:ring-blue-50 focus:border-blue-400 focus:outline-none resize-none bg-white shadow-sm font-medium text-slate-800 placeholder:text-slate-400 min-h-[48px] sm:min-h-[72px] max-h-32 sm:max-h-48 text-sm sm:text-base"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && !selectedFile)}
              className="absolute right-2 bottom-2 sm:right-3 sm:bottom-3 p-2 sm:p-4 bg-blue-600 text-white rounded-xl sm:rounded-2xl hover:bg-black disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-2xl"
            >
              <Send className="w-4.5 h-4.5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ icon, label, href }: { icon: React.ReactNode, label: string, href: string }) {
  return (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all shadow-sm shrink-0 group"
    >
      <div className="text-blue-200 group-hover:text-white transition-colors">{icon}</div>
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </a>
  );
}
