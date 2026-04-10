import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { GoogleGenerativeAI } from "@google/generative-ai";
import remarkGfm from 'remark-gfm';
import PDFModal from './PDFModal';

const SYSTEM_PROMPT = `Advanced System Prompt: VTU Intelligence Core
1. IDENTITY & GOAL
You are VTU Intelligence, the official AI academic concierge for Visvesvaraya Technological University (VTU). Your goal is to provide 100% accurate information regarding syllabus, exam regulations, backlog (ATKT) systems, and university circulars.

2. KNOWLEDGE RETRIEVAL & GROUNDING (RAG MODE)
- Priority Source: Always prioritize information from the official domain "vtu.ac.in" and its sub-domains (e.g., results.vtu.ac.in, exam.vtu.ac.in, etc.).
- Deep Search: When a student asks a query, perform a thorough search across the university's digital infrastructure.
- Verification Rule: If a student asks about a "2026 Circular," search the live site first. Do not hallucinate dates or rules. If the information is not on the site or in your files, state: "I cannot find an official record of this. Please check the CNC department notice board."
- Reporting: When requested for a report, synthesize information from multiple official VTU sources into a structured, comprehensive summary.

3. ADVANCED FEATURES & LOGIC
- Backlog/ATKT Logic: When a student mentions a "Backlog," strictly follow the Manual/Batch Enrollment rules. Remind them that they remain enrolled until they pass and the subject carries forward.
- Examination Focus: Prioritize accurate information for examination schedules, results, revaluation processes, and hall ticket queries.
- Multilingual Support: Default to English, but if a student asks in Kannada, respond fluently in Kannada while maintaining technical accuracy for course codes.
- Multimodal Analysis: If a student uploads a screenshot of their result or a handwritten query, use your Vision capabilities to extract the relevant data before responding.

4. OUTPUT FORMATTING (University Standard)
- Markdown Tables: ALWAYS use Markdown tables for schedules, fee structures, or eligibility criteria.
- No HTML: DO NOT use <br> tags or other HTML. Use proper Markdown line breaks and lists.
- Clarity: Use Bold for Unique Course Codes and Credits.
- Tone: Professional, supportive, and grounded. Use "Faculty" instead of "Instructor."

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
  timestamp: Date;
  feedback?: 'up' | 'down';
  isTyping?: boolean;
  groundingMetadata?: any;
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

export default function DeployedChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ type: 'image' | 'pdf', data: string, name: string } | null>(null);
  const [viewingPdf, setViewingPdf] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Lead Capture State
  const [isLeadCaptured, setIsLeadCaptured] = useState(false);
  const [activeModel, setActiveModel] = useState<string | null>(null);
  const [ragMode, setRagMode] = useState(true); // Default to RAG mode
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
    // Simple email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userData.email)) {
      setLeadFormError('Please enter a valid email address.');
      return;
    }
    
    localStorage.setItem('vtu_user_data', JSON.stringify(userData));
    setIsLeadCaptured(true);
    
    // Add a welcome message if history is empty
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

  const extractPdfLinks = (text: string) => {
    const pdfRegex = /https?:\/\/[^\s)]+\.pdf/gi;
    return Array.from(new Set(text.match(pdfRegex) || []));
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
      // Priority 1: Gemini RAG Mode (if VITE_GEMINI_API_KEY is present)
      const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
      const OPENROUTER_API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY;

      if (ragMode && GEMINI_API_KEY) {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ 
          model: "gemini-2.0-flash-exp",
          tools: [{ googleSearchRetrieval: {} }] as any
        });

        const chat = model.startChat({
          history: messages.slice(-10).map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          })),
          generationConfig: {
            maxOutputTokens: 2048,
          },
        });

        const prompt = `${SYSTEM_PROMPT}\n\n[USER CONTEXT: Name: ${userData.name}, Email: ${userData.email}]\n\nQUERY: ${input}`;
        
        let result;
        if (selectedFile?.type === 'image') {
          const base64Data = selectedFile.data.split(',')[1];
          const mimeType = selectedFile.data.split(';')[0].split(':')[1];
          result = await model.generateContent([
            prompt,
            { inlineData: { data: base64Data, mimeType } }
          ]);
        } else {
          result = await chat.sendMessage(prompt);
        }

        const responseText = result.response.text();
        const groundingMetadata = (result.response as any).groundingMetadata;
        
        setActiveModel("gemini-2.0-flash-exp (RAG)");
        setMessages(prev => prev.map(m => 
          m.id === botMessageId ? { 
            ...m, 
            content: responseText, 
            isTyping: true,
            groundingMetadata: groundingMetadata 
          } : m
        ));
        setIsLoading(false);
        return;
      }

      // Priority 2: OpenRouter Fallback
      if (!OPENROUTER_API_KEY) {
        throw new Error("API Keys missing. Please set VITE_GEMINI_API_KEY or VITE_OPENROUTER_API_KEY in your environment.");
      }
      
      const history = messages.slice(-10).map(msg => ({
        role: msg.role === 'bot' ? 'assistant' : 'user',
        content: msg.content || (msg.image ? "User sent an image." : "User sent a document.")
      }));

      // Inject user context into the first message if it's a new session
      const userContext = `[SYSTEM: You are talking to ${userData.name} (Email: ${userData.email}). Use their name occasionally to be professional.]`;
      
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
              { "role": "system", "content": `${SYSTEM_PROMPT}\n\n${userContext}` },
              ...history,
              { "role": "user", "content": currentContent }
            ],
            "route": "fallback"
          })
        });
      };

      let response = await makeRequest("google/gemma-4-26b-a4b-it:free");
      let data = await response.json();
      let usedModel = "google/gemma-4-26b-a4b-it:free";

      // Multi-tier fallback system for maximum reliability
      if (!response.ok || (data.error?.message?.includes("Provider returned error")) || (data.error?.message?.includes("No endpoints found")) || (data.error?.message?.includes("User not found"))) {
        console.warn("Primary model (Gemma 4 26B) failed, trying fallback 1 (Gemma 4 31B)...");
        response = await makeRequest("google/gemma-4-31b:free");
        data = await response.json();
        usedModel = "google/gemma-4-31b:free";
        
        if (!response.ok || (data.error?.message?.includes("Provider returned error")) || (data.error?.message?.includes("No endpoints found"))) {
          console.warn("Fallback 1 failed, trying fallback 2 (GPT-OSS 120B)...");
          response = await makeRequest("openai/gpt-oss-120b:free");
          data = await response.json();
          usedModel = "openai/gpt-oss-120b:free";
        }
      }

      if (!response.ok) {
        console.error("OpenRouter Error Data:", data);
        const errorMsg = data.error?.message || `OpenRouter Error: ${response.status}`;
        if (errorMsg.includes("User not found")) {
          throw new Error("OpenRouter: User not found. This usually means your VITE_OPENROUTER_API_KEY is invalid or not correctly set in your environment variables.");
        }
        throw new Error(errorMsg);
      }

      const botResponse = data.choices[0].message.content;
      setActiveModel(usedModel);
      setMessages(prev => prev.map(m => 
        m.id === botMessageId ? { ...m, content: botResponse, isTyping: true } : m
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

      {/* Top Bar */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-2 rounded-xl text-white">
            <GraduationCap size={24} />
          </div>
          <div>
            <h3 className="font-black text-slate-900 tracking-tight text-lg">VTU Intelligence</h3>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                {isLeadCaptured ? `Active: ${userData.name}` : 'Awaiting Verification'}
                {activeModel && (
                  <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[7px] border border-slate-200 text-slate-500">
                    {activeModel.split('/')[1]}
                  </span>
                )}
              </span>
            </div>
          </div>
        </div>
          <div className="flex items-center gap-4">
            {isLeadCaptured && (
              <div className="flex items-center bg-slate-50 border border-slate-100 rounded-xl p-1 gap-1">
                <button 
                  onClick={() => setRagMode(false)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    !ragMode ? "bg-white text-slate-900 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  Standard
                </button>
                <button 
                  onClick={() => setRagMode(true)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                    ragMode ? "bg-indigo-600 text-white shadow-md shadow-indigo-100" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  <Search size={10} />
                  RAG Mode
                </button>
              </div>
            )}
            {isLeadCaptured && (
              <button 
                onClick={clearChat}
                className="p-2 hover:bg-slate-50 rounded-lg transition-colors text-slate-400 hover:text-red-500"
                title="Clear History"
              >
                <Trash2 size={18} />
              </button>
            )}
            <QuickLink icon={<Globe size={14} />} label="Results" href="https://results.vtu.ac.in" />
            <QuickLink icon={<BookOpen size={14} />} label="Syllabus" href="https://vtu.ac.in/en/b-e-scheme-syllabus/" />
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 bg-white scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-8 max-w-3xl mx-auto py-12">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-900 rounded-[48px] shadow-xl p-10"
            >
              <GraduationCap className="text-white" size={48} />
            </motion.div>
            <div className="space-y-2">
              <h3 className="font-black text-slate-900 text-3xl sm:text-4xl tracking-tight">VTU Intelligence</h3>
              <p className="text-slate-400 font-medium text-sm sm:text-lg max-w-xl mx-auto">
                Official Academic Concierge
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 w-full px-4">
              <SuggestionCard 
                icon={<ClipboardList size={18} />} 
                title="Academic Report" 
                desc="Generate VTU summary" 
                onClick={() => setInput("Generate a comprehensive report on the latest VTU academic circulars and exam regulations for 2024-25.")}
              />
              <SuggestionCard 
                icon={<Globe size={18} />} 
                title="Sub-domains" 
                desc="Search VTU portals" 
                onClick={() => setInput("Search all VTU sub-domains for information regarding the latest revaluation results.")}
              />
              <SuggestionCard 
                icon={<BookOpen size={18} />} 
                title="Syllabus" 
                desc="Scheme & Credits" 
                onClick={() => setInput("What are the credit requirements for the 2022 scheme in Computer Science?")}
              />
              <SuggestionCard 
                icon={<Search size={18} />} 
                title="Regulations" 
                desc="Backlog & ATKT" 
                onClick={() => setInput("Explain the latest VTU backlog (ATKT) rules for engineering students.")}
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
                        {msg.role === 'bot' && msg.isTyping ? (
                          <Typewriter 
                            text={msg.content} 
                            onComplete={() => {
                              setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isTyping: false } : m));
                            }} 
                          />
                        ) : (
                          <div className="relative group/msg">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code({ node, inline, className, children, ...props }: any) {
                                  const match = /language-(\w+)/.exec(className || '');
                                  return !inline && match ? (
                                    <div className="relative group my-4">
                                      <div className="absolute right-2 top-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button 
                                          onClick={() => copyToClipboard(String(children), msg.id + '-code')}
                                          className="p-1.5 bg-slate-800 text-white rounded-lg hover:bg-slate-700"
                                        >
                                          {copiedId === msg.id + '-code' ? <Check size={12} /> : <Copy size={12} />}
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
                                  <div className="overflow-x-auto my-4 rounded-xl border border-slate-200 bg-white shadow-sm">
                                    <table className="min-w-full border-collapse">
                                      {children}
                                    </table>
                                  </div>
                                ),
                                thead: ({ children }) => <thead className="bg-slate-50 border-b border-slate-100">{children}</thead>,
                                th: ({ children }) => <th className="px-4 py-3 text-left text-[9px] font-black text-slate-400 uppercase tracking-widest">{children}</th>,
                                tr: ({ children }) => <tr className="hover:bg-slate-50/50 transition-colors">{children}</tr>,
                                td: ({ children }) => <td className="px-4 py-3 text-xs sm:text-sm text-slate-600 border-t border-slate-50">{children}</td>,
                                strong: ({ children }) => <strong className="text-slate-900 font-bold">{children}</strong>,
                                h1: ({ children }) => <h1 className="text-lg sm:text-xl font-black text-slate-900 mb-3 tracking-tight">{children}</h1>,
                                h2: ({ children }) => <h2 className="text-base sm:text-lg font-black text-slate-900 mb-2 tracking-tight">{children}</h2>,
                                p: ({ children }) => <p className="mb-3 text-slate-600 font-medium leading-relaxed text-sm last:mb-0">{children}</p>,
                                ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1 text-slate-600 text-sm">{children}</ul>,
                                ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1 text-slate-600 text-sm">{children}</ol>,
                                li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>

                            {msg.role === 'bot' && !msg.isTyping && (
                              <div className="absolute top-0 -right-12 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                                <button 
                                  onClick={() => copyToClipboard(msg.content, msg.id)}
                                  className="p-2 bg-white border border-slate-100 text-slate-400 rounded-xl hover:text-slate-900 hover:border-slate-300 shadow-sm"
                                  title="Copy message"
                                >
                                  {copiedId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {msg.role === 'bot' && !msg.isTyping && extractPdfLinks(msg.content).length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {extractPdfLinks(msg.content).map((link, idx) => (
                              <a
                                key={idx}
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] sm:text-xs font-black hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 group/btn"
                              >
                                <FileText size={14} className="group-hover:scale-110 transition-transform" />
                                DOWNLOAD CIRCULAR (PDF)
                              </a>
                            ))}
                          </div>
                        )}

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
      <div className="bg-white border-t border-slate-50 p-4 sm:p-6">
        {selectedFile && (
          <div className="relative inline-block group mb-4">
            {selectedFile.type === 'image' ? (
              <img 
                src={selectedFile.data} 
                alt="Preview" 
                className="h-16 w-16 sm:h-24 sm:w-24 object-cover rounded-xl border border-slate-200 shadow-lg"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-16 w-16 sm:h-24 sm:w-24 bg-slate-50 rounded-xl border border-slate-200 shadow-lg flex flex-col items-center justify-center text-center p-2">
                <FileText className="text-slate-400 mb-1 w-6 h-6" />
                <p className="text-[6px] font-black text-slate-600 truncate w-full">{selectedFile.name}</p>
              </div>
            )}
            <button 
              onClick={clearFile}
              className="absolute -top-1 -right-1 bg-slate-900 text-white rounded-full p-1 shadow-lg hover:bg-black transition-all"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
        
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl bg-slate-50 border border-slate-100 p-3 sm:p-4 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-all shrink-0"
          >
            <Paperclip className="w-5 h-5" />
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
              className="w-full rounded-2xl border border-slate-100 p-3 sm:p-4 pr-12 sm:pr-16 text-sm min-h-[48px] max-h-32 focus:ring-4 focus:ring-slate-50 focus:border-slate-200 focus:outline-none resize-none bg-slate-50/50 font-medium text-slate-800 placeholder:text-slate-400"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && !selectedFile)}
              className="absolute right-2 bottom-2 p-2 sm:p-2.5 bg-slate-900 text-white rounded-xl hover:bg-black disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-sm"
            >
              <Send className="w-4 h-4" />
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
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-100 text-slate-600 hover:border-slate-300 hover:text-slate-900 transition-all shadow-sm shrink-0 group"
    >
      <div className="text-slate-400 group-hover:text-slate-900 transition-colors">{icon}</div>
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </a>
  );
}

function SuggestionCard({ icon, title, desc, onClick }: { icon: React.ReactNode, title: string, desc: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-start p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-white border border-slate-100 text-left hover:border-indigo-400 hover:shadow-xl transition-all group"
    >
      <div className="bg-slate-50 p-2 sm:p-3 rounded-lg sm:rounded-xl text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all mb-3 sm:mb-4">
        {icon}
      </div>
      <h4 className="font-black text-slate-900 tracking-tight text-xs sm:text-sm mb-1">{title}</h4>
      <p className="text-slate-400 font-bold leading-relaxed text-[8px] sm:text-[10px]">{desc}</p>
    </button>
  );
}
