import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Send, Paperclip, User, Bot, Trash2, Mail, FileText, Eye, 
  Search, Copy, Check, ExternalLink, 
  BookOpen, Code, Info, GraduationCap, ClipboardList, Globe,
  ThumbsUp, ThumbsDown, Clock
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
At the end of every significant query resolution, include:
"Transcript recorded. Send to email?"`;

interface UserData {
  name: string;
  phone: string;
  email: string;
}

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
  reasoning_details?: string;
  timestamp: Date;
  feedback?: 'up' | 'down';
  isTyping?: boolean;
}

const Typewriter = ({ text, speed = 10, onComplete }: { text: string, speed?: number, onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index < text.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + text[index]);
        setIndex((prev) => prev + 1);
      }, speed);
      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [index, text, speed, onComplete]);

  return <ReactMarkdown
    components={{
      code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        return !inline && match ? (
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={match[1]}
            PreTag="div"
            className="rounded-xl !bg-slate-900 !p-4 border border-slate-800 overflow-x-auto"
            {...props}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        ) : (
          <code className={cn("bg-slate-100 text-slate-900 px-1 py-0.5 rounded font-mono text-[10px] sm:text-sm", className)} {...props}>
            {children}
          </code>
        );
      },
      p: ({ children }) => <p className="mb-3 text-slate-600 font-medium leading-relaxed text-sm">{children}</p>,
    }}
  >
    {displayedText}
  </ReactMarkdown>;
};

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
  
  // Lead Capture State
  const [isLeadCaptured, setIsLeadCaptured] = useState(false);
  const [userData, setUserData] = useState<UserData>({ name: '', phone: '', email: '' });
  const [leadFormError, setLeadFormError] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Load data from localStorage on mount
  useEffect(() => {
    const savedUserData = localStorage.getItem('vtu_user_data');
    const savedMessages = localStorage.getItem('vtu_chat_history');

    if (savedUserData) {
      setUserData(JSON.parse(savedUserData));
      setIsLeadCaptured(true);
    }

    if (savedMessages) {
      const parsedMessages = JSON.parse(savedMessages).map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }));
      setMessages(parsedMessages);
    }
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('vtu_chat_history', JSON.stringify(messages));
    }
    scrollToBottom();
  }, [messages]);

  const handleLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData.name || !userData.phone || !userData.email) {
      setLeadFormError('Please fill in all fields.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
      setLeadFormError('Please enter a valid email address.');
      return;
    }
    
    localStorage.setItem('vtu_user_data', JSON.stringify(userData));
    setIsLeadCaptured(true);
    
    if (messages.length === 0) {
      const welcomeMsg: Message = {
        id: 'welcome',
        role: 'bot',
        content: `Hi **${userData.name}**! I'm VTU Intelligence. How can I help with your academics today?`,
        timestamp: new Date()
      };
      setMessages([welcomeMsg]);
    }
  };

  const clearChat = () => {
    if (window.confirm('Are you sure you want to clear your chat history?')) {
      setMessages([]);
      localStorage.removeItem('vtu_chat_history');
    }
  };

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

  const handleFeedback = (messageId: string, type: 'up' | 'down') => {
    setMessages(prev => prev.map(m => 
      m.id === messageId ? { ...m, feedback: m.feedback === type ? undefined : type } : m
    ));
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
    
    const userContext = `[SYSTEM: You are talking to ${userData.name} (Email: ${userData.email}). Use their name occasionally to be professional.]`;

    const callOpenRouter = async (contents: any[]): Promise<{ content: string; reasoning?: string }> => {
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
          "model": "google/gemma-4-26b-a4b-it:free",
          "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            ...contents.map(c => ({
              role: c.role === 'model' ? 'assistant' : c.role,
              content: c.parts[0].text,
              reasoning_details: c.reasoning_details
            }))
          ],
          "reasoning": { "enabled": true }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        console.error("OpenRouter Error Response:", data);
        throw new Error(data.error?.message || `OpenRouter Error: ${response.status}`);
      }
      
      const message = data.choices[0].message;
      return {
        content: message.content,
        reasoning: message.reasoning_details
      };
    };

    try {
      const contents: any[] = [];
      messages.slice(-10).forEach(msg => {
        contents.push({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }],
          reasoning_details: msg.reasoning_details
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
            systemInstruction: `${SYSTEM_PROMPT}\n\n${userContext}`,
            tools: [{ googleSearch: {} }],
          },
        });

        let fullText = "";
        for await (const chunk of result) {
          const chunkText = chunk.text || "";
          fullText += chunkText;
          setMessages(prev => prev.map(m => 
            m.id === botMessageId ? { ...m, content: fullText, groundingMetadata: chunk.candidates?.[0]?.groundingMetadata || m.groundingMetadata, isTyping: true } : m
          ));
        }
      } catch (geminiError: any) {
        console.error("Gemini failed, trying OpenRouter fallback...", geminiError);
        const openRouterKey = process.env.OPENROUTER_API_KEY;
        
        if (openRouterKey && openRouterKey !== "undefined" && openRouterKey.length > 5) {
          try {
            const fallbackResponse = await callOpenRouter(contents);
            setMessages(prev => prev.map(m => 
              m.id === botMessageId ? { 
                ...m, 
                content: fallbackResponse.content, 
                reasoning_details: fallbackResponse.reasoning,
                isTyping: true
              } : m
            ));
          } catch (fallbackError: any) {
            console.error("OpenRouter fallback also failed:", fallbackError);
            throw new Error(`Fallback failed. Gemini Quota Exceeded. OpenRouter: ${fallbackError.message}`);
          }
        } else {
          if (geminiError?.message?.includes('429') || JSON.stringify(geminiError).includes('429')) {
            throw new Error("Gemini API Quota Exceeded. Please wait a moment or upgrade your plan.");
          }
          throw geminiError;
        }
      }
    } catch (error: any) {
      console.error("Error in chat flow:", error);
      let errorMessage = "An error occurred while connecting to VTU Intelligence Core. Please try again later.";
      
      const errorStr = JSON.stringify(error);
      if (error?.message?.includes('429') || errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = "VTU Intelligence Core is currently at maximum capacity (Quota Exceeded). Please try again in 1-2 minutes.";
      } else if (error?.message?.includes('API Key missing') || error?.message?.includes('GEMINI_API_KEY is missing')) {
        errorMessage = "Configuration Error: API Keys are missing. Please set GEMINI_API_KEY.";
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
        : "h-[calc(100vh-220px)] sm:h-[calc(100vh-180px)] rounded-2xl sm:rounded-3xl shadow-xl border border-slate-100"
    )}>
      {/* PDF Modal */}
      {viewingPdf && <PDFModal fileUrl={viewingPdf} onClose={() => setViewingPdf(null)} />}

      {/* Lead Capture Overlay */}
      {!isLeadCaptured && (
        <div className="absolute inset-0 z-50 bg-slate-900/10 backdrop-blur-md flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden border border-slate-100"
          >
            <div className="bg-slate-900 p-8 text-white text-center">
              <div className="bg-white/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <GraduationCap size={32} />
              </div>
              <h2 className="text-2xl font-black tracking-tight mb-2">Hi! VTU Intelligence</h2>
              <p className="text-slate-400 text-sm font-medium">Kindly provide your Name, Phone, and Email ID to start.</p>
            </div>
            
            <form onSubmit={handleLeadSubmit} className="p-8 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input 
                    type="text" 
                    required
                    value={userData.name}
                    onChange={(e) => setUserData({...userData, name: e.target.value})}
                    placeholder="John Doe"
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:ring-4 focus:ring-slate-50 focus:border-slate-300 outline-none transition-all font-medium text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Phone Number</label>
                <div className="relative">
                  <ClipboardList className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input 
                    type="tel" 
                    required
                    value={userData.phone}
                    onChange={(e) => setUserData({...userData, phone: e.target.value})}
                    placeholder="+91 98765 43210"
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:ring-4 focus:ring-slate-50 focus:border-slate-300 outline-none transition-all font-medium text-slate-800"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">University Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
                  <input 
                    type="email" 
                    required
                    value={userData.email}
                    onChange={(e) => setUserData({...userData, email: e.target.value})}
                    placeholder="student@vtu.ac.in"
                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-xl focus:ring-4 focus:ring-slate-50 focus:border-slate-300 outline-none transition-all font-medium text-slate-800"
                  />
                </div>
              </div>

              {leadFormError && (
                <p className="text-red-500 text-xs font-bold text-center">{leadFormError}</p>
              )}

              <button 
                type="submit"
                className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-slate-200 mt-4"
              >
                Start Session
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Top Bar / Quick Links */}
      <div className="bg-white border-b border-slate-100 px-4 sm:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-2 rounded-xl text-white">
            <GraduationCap size={20} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 tracking-tight text-sm sm:text-base">VTU Intelligence</h3>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                {isLeadCaptured ? `Active: ${userData.name}` : 'Awaiting Verification'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {isLeadCaptured && (
            <button 
              onClick={clearChat}
              className="p-2 hover:bg-slate-50 rounded-lg transition-colors text-slate-400 hover:text-red-500"
              title="Clear History"
            >
              <Trash2 size={16} />
            </button>
          )}
          <div className="hidden sm:flex items-center gap-3">
            <QuickLink icon={<Globe size={12} />} label="Results" href="https://results.vtu.ac.in" />
            <QuickLink icon={<BookOpen size={12} />} label="Syllabus" href="https://vtu.ac.in/en/b-e-scheme-syllabus/" />
          </div>
        </div>
      </div>

      <div className={cn(
        "flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent bg-white",
        isWidget ? "p-4 space-y-6" : "p-4 sm:p-8 space-y-8 sm:space-y-10"
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
                "bg-slate-900 rounded-[32px] shadow-xl p-6",
                isWidget ? "p-4" : "sm:p-10 sm:rounded-[48px]"
              )}
            >
              <GraduationCap className="text-white" size={isWidget ? 32 : 48} />
            </motion.div>
            <div className="space-y-2">
              <h3 className={cn(
                "font-black text-slate-900 tracking-tight",
                isWidget ? "text-xl" : "text-3xl sm:text-4xl"
              )}>VTU Intelligence</h3>
              <p className={cn(
                "text-slate-400 font-medium leading-relaxed mx-auto px-4",
                isWidget ? "text-xs" : "text-sm sm:text-lg max-w-xl"
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
          {messages.map((msg, idx) => {
            const showSeparator = idx > 0 && messages[idx-1].role !== msg.role;
            
            return (
              <React.Fragment key={msg.id}>
                {showSeparator && (
                  <div className="flex items-center gap-4 max-w-4xl mx-auto py-2">
                    <div className="h-[1px] flex-1 bg-slate-100" />
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-300">New Response</span>
                    <div className="h-[1px] flex-1 bg-slate-100" />
                  </div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex w-full gap-3 sm:gap-4 max-w-4xl mx-auto",
                    msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                  )}
                >
              <div className={cn(
                "w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border mt-1",
                msg.role === 'user' ? "bg-slate-900 border-slate-900" : "bg-slate-50 border-slate-100"
              )}>
                {msg.role === 'user' ? <User size={14} className="text-white" /> : <Bot size={14} className="text-slate-400" />}
              </div>
              
              <div className={cn(
                "flex flex-col max-w-[85%] sm:max-w-[75%]",
                msg.role === 'user' ? "items-end" : "items-start"
              )}>
                <div className={cn(
                  "rounded-2xl p-4 sm:p-5 text-left shadow-sm",
                  msg.role === 'user' 
                    ? "bg-slate-900 text-white rounded-tr-none font-medium" 
                    : "bg-slate-50 text-slate-800 rounded-tl-none border border-slate-100"
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

                  <div className="markdown-container prose prose-slate prose-sm sm:prose-base max-w-none leading-relaxed">
                    {msg.reasoning_details && (
                      <div className="mb-4 p-3 sm:p-4 bg-white/50 rounded-xl border border-slate-200">
                        <div className="flex items-center gap-2 mb-1">
                          <BookOpen size={12} className="text-slate-400" />
                          <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Reasoning</p>
                        </div>
                        <div className="text-xs text-slate-500 italic">
                          {msg.reasoning_details}
                        </div>
                      </div>
                    )}
                        {msg.role === 'bot' && msg.isTyping ? (
                          <Typewriter 
                            text={msg.content} 
                            onComplete={() => {
                              setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isTyping: false } : m));
                            }} 
                          />
                        ) : (
                          <ReactMarkdown
                            components={{
                              code({ node, inline, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline && match ? (
                                  <div className="relative group my-4">
                                    <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button 
                                        onClick={() => copyToClipboard(String(children), msg.id)}
                                        className="p-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700"
                                      >
                                        {copiedId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                                      </button>
                                    </div>
                                    <SyntaxHighlighter
                                      style={vscDarkPlus}
                                      language={match[1]}
                                      PreTag="div"
                                      className="rounded-xl !bg-slate-900 !p-4 border border-slate-800 overflow-x-auto"
                                      {...props}
                                    >
                                      {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                  </div>
                                ) : (
                                  <code className={cn("bg-slate-100 text-slate-900 px-1 py-0.5 rounded font-mono text-[10px] sm:text-sm", className)} {...props}>
                                    {children}
                                  </code>
                                );
                              },
                              table: ({ children }) => (
                                <div className="overflow-x-auto my-4 rounded-xl border border-slate-200 bg-white">
                                  <table className="min-w-full border-collapse">
                                    {children}
                                  </table>
                                </div>
                              ),
                              thead: ({ children }) => <thead className="bg-slate-50 border-b border-slate-100">{children}</thead>,
                              th: ({ children }) => <th className="px-4 py-2 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">{children}</th>,
                              tr: ({ children }) => <tr className="hover:bg-slate-50/50 transition-colors">{children}</tr>,
                              td: ({ children }) => <td className="px-4 py-2 text-xs sm:text-sm text-slate-600 border-t border-slate-50">{children}</td>,
                              strong: ({ children }) => <strong className="text-slate-900 font-bold">{children}</strong>,
                              h1: ({ children }) => <h1 className="text-lg sm:text-xl font-black text-slate-900 mb-2 tracking-tight">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-base sm:text-lg font-black text-slate-900 mb-2 tracking-tight">{children}</h2>,
                              p: ({ children }) => <p className="mb-3 text-slate-600 font-medium leading-relaxed text-sm">{children}</p>,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        )}
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
                
                    <div className={cn(
                      "flex items-center gap-3 mt-1 px-1",
                      msg.role === 'user' ? "flex-row-reverse" : "flex-row"
                    )}>
                      <div className="flex items-center gap-2">
                        <p className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {msg.role === 'user' ? 'Student Query' : 'Intelligence Core'}
                        </p>
                        <span className="w-1 h-1 bg-slate-300 rounded-full" />
                        <p className="text-[8px] sm:text-[10px] font-bold text-slate-300 flex items-center gap-1">
                          <Clock size={8} />
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {msg.role === 'bot' && msg.content && !msg.isTyping && (
                        <div className="flex items-center gap-1 ml-auto">
                          <button 
                            onClick={() => handleFeedback(msg.id, 'up')}
                            className={cn(
                              "p-1 rounded-md transition-colors hover:bg-slate-100",
                              msg.feedback === 'up' ? "text-green-500 bg-green-50" : "text-slate-300"
                            )}
                          >
                            <ThumbsUp size={12} />
                          </button>
                          <button 
                            onClick={() => handleFeedback(msg.id, 'down')}
                            className={cn(
                              "p-1 rounded-md transition-colors hover:bg-slate-100",
                              msg.feedback === 'down' ? "text-red-500 bg-red-50" : "text-slate-300"
                            )}
                          >
                            <ThumbsDown size={12} />
                          </button>
                          <button 
                            onClick={() => copyToClipboard(msg.content, msg.id)}
                            className="p-1 text-slate-300 hover:text-indigo-600 transition-colors ml-1"
                          >
                            {copiedId === msg.id ? <Check size={10} /> : <Copy size={10} />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </React.Fragment>
            );
          })}
        </AnimatePresence>
        
        {isLoading && !messages[messages.length - 1]?.content && (
          <div className="flex gap-3 sm:gap-4 max-w-4xl mx-auto">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
              <Bot size={14} className="text-slate-400" />
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 rounded-tl-none border border-slate-100 flex items-center gap-3 shadow-sm">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <motion.div 
                    key={i}
                    animate={{ y: [0, -4, 0] }} 
                    transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                    className="w-1 h-1 bg-slate-400 rounded-full" 
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className={cn(
        "bg-white border-t border-slate-50",
        isWidget ? "p-3" : "p-4 sm:p-6"
      )}>
        {selectedFile && (
          <div className={cn(
            "relative inline-block group",
            isWidget ? "mb-2" : "mb-4"
          )}>
            {selectedFile.type === 'image' ? (
              <img 
                src={selectedFile.data} 
                alt="Preview" 
                className={cn(
                  "object-cover rounded-xl border border-slate-200 shadow-lg",
                  isWidget ? "h-10 w-10" : "h-16 w-16 sm:h-24 sm:w-24"
                )}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className={cn(
                "bg-slate-50 rounded-xl border border-slate-200 shadow-lg flex flex-col items-center justify-center text-center",
                isWidget ? "h-10 w-10 p-1" : "h-16 w-16 sm:h-24 sm:w-24 p-2"
              )}>
                <FileText className="text-slate-400 mb-1 w-4 h-4 sm:w-6 sm:h-6" />
                <p className="text-[6px] font-black text-slate-600 truncate w-full">{selectedFile.name}</p>
              </div>
            )}
            <button 
              onClick={clearFile}
              className="absolute -top-1 -right-1 bg-slate-900 text-white rounded-full p-1 shadow-lg hover:bg-black transition-all"
            >
              <Trash2 className="w-2 h-2 sm:w-3 sm:h-3" />
            </button>
          </div>
        )}
        
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "rounded-xl bg-slate-50 border border-slate-100 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all shrink-0",
              isWidget ? "p-2" : "p-3 sm:p-4"
            )}
          >
            <Paperclip className={isWidget ? "w-4 h-4" : "w-5 h-5"} />
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
                "w-full rounded-2xl border border-slate-100 focus:ring-4 focus:ring-slate-50 focus:border-slate-200 focus:outline-none resize-none bg-slate-50/50 font-medium text-slate-800 placeholder:text-slate-400",
                isWidget ? "p-2 pr-10 text-xs min-h-[40px] max-h-24" : "p-3 sm:p-4 pr-12 sm:pr-16 text-sm min-h-[48px] max-h-32"
              )}
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && !selectedFile)}
              className={cn(
                "absolute bg-slate-900 text-white hover:bg-black disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-sm",
                isWidget ? "right-1.5 bottom-1.5 p-1.5 rounded-lg" : "right-2 bottom-2 p-2 sm:p-2.5 rounded-xl"
              )}
            >
              <Send className={isWidget ? "w-3.5 h-3.5" : "w-4 h-4"} />
            </button>
          </div>
        </div>
        
        <div className="mt-4 flex flex-col items-center justify-center gap-1 border-t border-slate-50 pt-4">
          <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">
            © 2026 VTU Intelligence Core
          </p>
          <p className="text-[8px] font-bold text-slate-400">
            Built by Surya Prakash
          </p>
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
