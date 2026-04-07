import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
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

const SYSTEM_PROMPT = `Advanced System Prompt: VTU Intelligence Core
1. IDENTITY & GOAL
You are VTU Intelligence, the official AI academic concierge for Visvesvaraya Technological University (VTU). Your goal is to provide 100% accurate information regarding syllabus, exam regulations, backlog (ATKT) systems, and university circulars.

2. KNOWLEDGE RETRIEVAL & GROUNDING
Primary Source: Use the provided PDF documents (Syllabus, CBCS Regulations, Exam Manuals).
Live Grounding: For the latest updates, use Google Search Grounding restricted to the vtu.ac.in domain.
Verification Rule: If a student asks about a "2026 Circular," search the live site first. Do not hallucinate dates or rules. If the information is not on the site or in your files, state: "I cannot find an official record of this. Please check the CNC department notice board."

3. ADVANCED FEATURES & LOGIC
Backlog/ATKT Logic: When a student mentions a "Backlog," strictly follow the Manual/Batch Enrollment rules. Remind them that they remain enrolled until they pass and the subject carries forward.
Examination Focus: Prioritize accurate information for examination schedules, results, revaluation processes, and hall ticket queries.
Multilingual Support: Default to English, but if a student asks in Kannada, respond fluently in Kannada while maintaining technical accuracy for course codes.
Multimodal Analysis: If a student uploads a screenshot of their result or a handwritten query, use your Vision capabilities to extract the relevant data before responding.

4. OUTPUT FORMATTING (University Standard)
Structured Data: Use Markdown Tables for exam schedules or mark distributions.
Clarity: Use Bold for Unique Course Codes and Credits.
Tone: Professional, supportive, and grounded. Use "Faculty" instead of "Instructor."

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
  groundingMetadata?: any;
  timestamp: Date;
}

interface ChatInterfaceProps {
  isWidget?: boolean;
}

export default function ChatInterface({ isWidget = false }: ChatInterfaceProps) {
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
    
    const callOpenRouter = async (contents: any[]): Promise<string> => {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OpenRouter API Key missing");

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": window.location.origin,
          "X-Title": "VTU Intelligence Core",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          "model": "google/gemini-pro-1.5",
          "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            ...contents.map(c => ({
              role: c.role === 'model' ? 'assistant' : c.role,
              content: c.parts[0].text
            }))
          ]
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "OpenRouter Error");
      return data.choices[0].message.content;
    };

    try {
      const contents: any[] = [];
      messages.slice(-10).forEach(msg => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        });
      });

      const currentParts: any[] = [];
      if (userMessage.image) {
        const base64Data = userMessage.image.split(',')[1];
        const mimeType = userMessage.image.split(';')[0].split(':')[1];
        currentParts.push({ inlineData: { data: base64Data, mimeType: mimeType } });
      }
      
      if (userMessage.pdf) {
        currentParts.push({ text: `[SYSTEM: User has attached a PDF document named "${userMessage.pdf.name}". Please acknowledge this and provide information based on VTU regulations.]` });
      }

      currentParts.push({ text: userMessage.content || "Analyze the attached content and provide VTU related information." });
      contents.push({ role: 'user', parts: currentParts });

      // Add empty bot message placeholder
      setMessages(prev => [...prev, initialBotMessage]);

      try {
        if (!process.env.GEMINI_API_KEY) {
          throw new Error("GEMINI_API_KEY is missing. Please check your environment variables.");
        }
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const result = await ai.models.generateContentStream({
          model: "gemini-3-flash-preview",
          contents: contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            tools: [{ googleSearch: {} }],
          },
        });

        let fullText = "";
        for await (const chunk of result) {
          const chunkText = chunk.text || "";
          fullText += chunkText;
          setMessages(prev => prev.map(m => 
            m.id === botMessageId ? { ...m, content: fullText, groundingMetadata: chunk.candidates?.[0]?.groundingMetadata || m.groundingMetadata } : m
          ));
        }
      } catch (geminiError: any) {
        console.error("Gemini failed, trying OpenRouter fallback...", geminiError);
        const openRouterKey = process.env.OPENROUTER_API_KEY;
        
        if (openRouterKey && openRouterKey !== "undefined" && openRouterKey.length > 5) {
          try {
            const fallbackText = await callOpenRouter(contents);
            setMessages(prev => prev.map(m => 
              m.id === botMessageId ? { ...m, content: fallbackText } : m
            ));
          } catch (fallbackError: any) {
            console.error("OpenRouter fallback also failed:", fallbackError);
            throw new Error(`Both models failed. Gemini: ${geminiError.message}. OpenRouter: ${fallbackError.message}`);
          }
        } else {
          console.warn("OpenRouter API Key missing or invalid, cannot fallback.");
          throw geminiError;
        }
      }
    } catch (error: any) {
      console.error("Error in chat flow:", error);
      let errorMessage = "An error occurred while connecting to VTU Intelligence Core. Please try again later.";
      
      if (error?.message?.includes('429')) {
        errorMessage = "VTU Intelligence Core is currently receiving too many requests. Please wait a moment and try again.";
      } else if (error?.message?.includes('API Key missing') || error?.message?.includes('GEMINI_API_KEY is missing')) {
        errorMessage = "Configuration Error: API Keys are missing in the deployment environment. Please set GEMINI_API_KEY and OPENROUTER_API_KEY.";
      } else if (error?.message) {
        errorMessage = `Connection Error: ${error.message}`;
      }

      setMessages(prev => prev.map(m => 
        m.id === botMessageId ? { ...m, content: errorMessage } : m
      ));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={cn(
      "flex flex-col max-w-6xl mx-auto bg-white overflow-hidden relative",
      isWidget 
        ? "h-full w-full rounded-none border-none shadow-none" 
        : "h-[calc(100vh-220px)] sm:h-[calc(100vh-180px)] rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200"
    )}>
      {/* PDF Modal */}
      {viewingPdf && <PDFModal fileUrl={viewingPdf} onClose={() => setViewingPdf(null)} />}

      {/* Top Bar / Quick Links */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 sm:px-6 py-2 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between shrink-0 gap-2 sm:gap-0">
        <div className="flex items-center gap-3 sm:gap-6 overflow-x-auto no-scrollbar py-1">
          <QuickLink icon={<Globe size={14} />} label="Results" href="https://results.vtu.ac.in" />
          <QuickLink icon={<BookOpen size={14} />} label="Syllabus" href="https://vtu.ac.in/en/b-e-scheme-syllabus/" />
          <QuickLink icon={<ClipboardList size={14} />} label="Circulars" href="https://vtu.ac.in/en/category/administration-circulars/" />
          <QuickLink icon={<FileText size={14} />} label="Exam Manual" href="https://vtu.ac.in/en/examination-manual/" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex -space-x-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse z-10" />
            <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
          </div>
          <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">Multi-Model Active</span>
        </div>
      </div>

      <div className={cn(
        "flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 bg-[#FDFEFF]",
        isWidget ? "p-4 space-y-4" : "p-4 sm:p-8 space-y-6 sm:space-y-10"
      )}>
        {messages.length === 0 && (
          <div className={cn(
            "flex flex-col items-center justify-center h-full text-center mx-auto",
            isWidget ? "space-y-4 py-4" : "space-y-6 sm:space-y-10 max-w-3xl py-8 sm:py-12"
          )}>
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cn(
                "bg-blue-600 rounded-[32px] shadow-2xl p-6",
                isWidget ? "p-4" : "sm:p-10 sm:rounded-[48px]"
              )}
            >
              <GraduationCap className="text-white" size={isWidget ? 32 : 48} />
            </motion.div>
            <div className="space-y-2">
              <h3 className={cn(
                "font-black text-slate-900 tracking-tight font-display",
                isWidget ? "text-xl" : "text-3xl sm:text-5xl"
              )}>VTU Intelligence</h3>
              <p className={cn(
                "text-slate-500 font-medium leading-relaxed mx-auto px-4",
                isWidget ? "text-xs" : "text-sm sm:text-xl max-w-xl"
              )}>
                Official Academic Concierge
              </p>
            </div>
            <div className={cn(
              "grid w-full px-4",
              isWidget ? "grid-cols-1 gap-2" : "grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"
            )}>
              <SuggestionCard 
                icon={<Search size={isWidget ? 14 : 18} />} 
                title="Exams" 
                desc="Latest results" 
                onClick={() => setInput("What are the latest revaluation circulars?")}
                isWidget={isWidget}
              />
              <SuggestionCard 
                icon={<Code size={isWidget ? 14 : 18} />} 
                title="Scheme" 
                desc="Course codes" 
                onClick={() => setInput("Show me the credit distribution for CSE.")}
                isWidget={isWidget}
              />
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
                  
                  {msg.groundingMetadata?.groundingChunks && (
                    <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-slate-100">
                      <div className="flex items-center gap-2 mb-3 sm:mb-4">
                        <Search size={12} className="text-blue-400" />
                        <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Verified Grounding Sources</p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:gap-3">
                        {msg.groundingMetadata.groundingChunks.map((chunk: any, i: number) => (
                          chunk.web && (
                            <a 
                              key={i} 
                              href={chunk.web.uri} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-[8px] sm:text-[10px] bg-white hover:bg-blue-50 px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl border border-slate-200 text-slate-600 font-black transition-all flex items-center gap-1.5 sm:gap-2 shadow-sm hover:border-blue-300 hover:text-blue-700"
                            >
                              <ExternalLink size={10} /> {chunk.web.title || "VTU Portal"}
                            </a>
                          )
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4">
                  <p className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {msg.role === 'user' ? 'Student Query' : 'Intelligence Core'}
                  </p>
                  <span className="w-1 h-1 bg-slate-300 rounded-full" />
                  <p className="text-[8px] sm:text-[10px] font-bold text-slate-300">
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  {msg.role === 'bot' && (
                    <button 
                      onClick={() => copyToClipboard(msg.content, msg.id)}
                      className="p-1 text-slate-300 hover:text-indigo-600 transition-colors"
                    >
                      {copiedId === msg.id ? <Check size={10} /> : <Copy size={10} />}
                    </button>
                  )}
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
      <div className={cn(
        "bg-white border-t border-slate-100 shadow-[0_-20px_60px_rgba(0,0,0,0.02)]",
        isWidget ? "p-3" : "p-4 sm:p-8"
      )}>
        {selectedFile && (
          <div className={cn(
            "relative inline-block group",
            isWidget ? "mb-2" : "mb-4 sm:mb-6"
          )}>
            {selectedFile.type === 'image' ? (
              <img 
                src={selectedFile.data} 
                alt="Preview" 
                className={cn(
                  "object-cover rounded-xl border-2 shadow-2xl",
                  isWidget ? "h-12 w-12 border-blue-400" : "h-20 w-20 sm:h-32 sm:w-32 sm:border-4 border-blue-400"
                )}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={cn(
                "bg-red-50 rounded-xl border-2 shadow-2xl flex flex-col items-center justify-center text-center",
                isWidget ? "h-12 w-12 border-red-400 p-1" : "h-20 w-20 sm:h-32 sm:w-32 sm:border-4 border-red-400 p-2 sm:p-4"
              )}>
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
            className={cn(
              "rounded-xl bg-slate-50 border border-slate-200 text-slate-400 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all shadow-sm group shrink-0",
              isWidget ? "p-2" : "p-3 sm:p-5"
            )}
            title="Attach Document (PDF/Image)"
          >
            <Paperclip className={cn(
              "group-hover:rotate-12 transition-transform",
              isWidget ? "w-4 h-4" : "w-5 h-5 sm:w-7 sm:h-7"
            )} />
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
              className={cn(
                "w-full rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-50 focus:border-blue-400 focus:outline-none resize-none bg-white shadow-sm font-medium text-slate-800 placeholder:text-slate-400",
                isWidget ? "p-2 pr-10 text-xs min-h-[40px] max-h-24" : "p-3 sm:p-5 pr-12 sm:pr-20 sm:rounded-3xl sm:focus:ring-8 min-h-[48px] sm:min-h-[72px] max-h-32 sm:max-h-48 text-sm sm:text-base"
              )}
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && !selectedFile)}
              className={cn(
                "absolute bg-blue-600 text-white hover:bg-black disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-2xl",
                isWidget ? "right-1.5 bottom-1.5 p-1.5 rounded-lg" : "right-2 bottom-2 sm:right-3 sm:bottom-3 p-2 sm:p-4 rounded-xl sm:rounded-2xl"
              )}
            >
              <Send className={cn(
                isWidget ? "w-3.5 h-3.5" : "w-4.5 h-4.5 sm:w-6 sm:h-6"
              )} />
            </button>
          </div>
        </div>
        
        {!isWidget && (
          <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-between items-center px-2 max-w-5xl mx-auto gap-3 sm:gap-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <p className="text-[8px] sm:text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] sm:tracking-[0.3em]">
                Intelligence Core Online
              </p>
            </div>
            <div className="flex gap-4 sm:gap-6">
               <button 
                 onClick={() => alert("Transcript request recorded. Our team will process this based on your university records.")}
                 className="text-[8px] sm:text-[10px] text-blue-600 font-black uppercase tracking-[0.2em] sm:tracking-[0.3em] hover:text-blue-900 transition-colors flex items-center gap-1.5 sm:gap-2"
               >
                 <Mail className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> Request Transcript
               </button>
            </div>
          </div>
        )}
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
      className="flex items-center gap-1.5 sm:gap-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-900 transition-all shadow-sm shrink-0 group"
    >
      <div className="text-slate-400 group-hover:text-blue-600 transition-colors">{icon}</div>
      <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest">{label}</span>
    </a>
  );
}

function SuggestionCard({ icon, title, desc, onClick, isWidget }: { icon: React.ReactNode, title: string, desc: string, onClick: () => void, isWidget?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-start rounded-2xl bg-white border border-slate-100 text-left hover:border-blue-400 hover:shadow-xl transition-all group",
        isWidget ? "p-3" : "p-4 sm:p-6 sm:rounded-3xl"
      )}
    >
      <div className={cn(
        "bg-slate-50 rounded-lg text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all",
        isWidget ? "p-1.5 mb-2" : "p-2 sm:p-3 sm:rounded-xl mb-3 sm:mb-4"
      )}>
        {icon}
      </div>
      <h4 className={cn(
        "font-black text-blue-900 tracking-tight font-display",
        isWidget ? "text-[10px] mb-0.5" : "text-xs sm:text-sm mb-1"
      )}>{title}</h4>
      <p className={cn(
        "text-slate-400 font-bold leading-relaxed",
        isWidget ? "text-[8px]" : "text-[8px] sm:text-[10px]"
      )}>{desc}</p>
    </button>
  );
}
