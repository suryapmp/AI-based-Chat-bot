import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { 
  Send, Paperclip, User, Bot, Trash2, Mail, FileText, Eye, 
  Search, Copy, Check, ExternalLink, 
  BookOpen, Code, Info, GraduationCap, ClipboardList, Globe,
  ThumbsUp, ThumbsDown, Clock,
  Mic, MicOff, Loader2, Share2, MessageSquare,
  Volume2, VolumeX, Sparkles
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Modality } from "@google/genai";
import remarkGfm from 'remark-gfm';
import PDFModal from './PDFModal';

const SYSTEM_PROMPT = `Advanced System Prompt: VTU Intelligence Core
1. IDENTITY & GOAL
You are VTU Intelligence, the official AI academic concierge for Visvesvaraya Technological University (VTU). Your goal is to provide 100% accurate information regarding syllabus, exam regulations, backlog (ATKT) systems, and university circulars.

2. KNOWLEDGE RETRIEVAL & GROUNDING (RAG MODE)
- Priority Source: Always prioritize information from the official domain "vtu.ac.in" and its sub-domains (e.g., results.vtu.ac.in, exam.vtu.ac.in, admissions.vtu.ac.in, academic.vtu.ac.in, etc.).
- Deep Search: When a student asks a query, perform a thorough search across the university's digital infrastructure including all subdomains.
- Verification Rule: If a student asks about a "2026 Circular," search the live site first. Do not hallucinate dates or rules. If the information is not on the site or in your files, state: "I cannot find an official record of this on vtu.ac.in or its subdomains. Please check the CNC department notice board."
- Reporting: When requested for a report, synthesize information from multiple official VTU sources into a structured, comprehensive summary.
- Subdomains: Explicitly fetch and read content from subdomains like admissions.vtu.ac.in for entrance exams, results.vtu.ac.in for grades, and academic.vtu.ac.in for syllabus.

3. ADVANCED FEATURES & LOGIC
- Backlog/ATKT Logic: When a student mentions a "Backlog," strictly follow the Manual/Batch Enrollment rules. Remind them that they remain enrolled until they pass and the subject carries forward.
- Examination Focus: Prioritize accurate information for examination schedules, results, revaluation processes, and hall ticket queries.
- Multilingual Support: Default to English, but if a student asks in Kannada, respond fluently in Kannada while maintaining technical accuracy for course codes.
- Multimodal Analysis: If a student uploads a screenshot of their result or a handwritten query, use your Vision capabilities to extract the relevant data before responding.
- Sharing: You can now help students share their chat transcripts via Email or WhatsApp. If they ask to "send this to my email" or "share on whatsapp", tell them to use the buttons at the bottom of the chat window.

4. OUTPUT FORMATTING (University Standard)
- Markdown Tables: ALWAYS use Markdown tables for schedules, fee structures, or eligibility criteria.
- No HTML: DO NOT use <br> tags or other HTML. Use proper Markdown line breaks and lists.
- Clarity: Use Bold for Unique Course Codes and Credits.
- Tone: Professional, supportive, and grounded. Use "Faculty" instead of "Instructor."

5. TRANSACTIONAL CLOSURE
At the end of every significant query resolution, include:
"Transcript recorded. Send to email or WhatsApp?"`;

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
  return <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      code({ node, inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        return !inline && match ? (
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={match[1]}
            PreTag="div"
            className="rounded-xl !bg-vtu-text-main !p-4 border border-vtu-border overflow-x-auto"
            {...props}
          >
            {String(children).replace(/\n$/, '')}
          </SyntaxHighlighter>
        ) : (
          <code className={cn("bg-vtu-surface text-vtu-accent px-1 py-0.5 rounded font-mono text-[10px] sm:text-sm", className)} {...props}>
            {children}
          </code>
        );
      },
      p: ({ children }) => <p className="mb-3 text-vtu-text-muted font-medium leading-relaxed text-sm">{children}</p>,
    }}
  >
    {text}
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
  const [isListening, setIsListening] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stopAudio = () => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {}
      audioSourceRef.current = null;
    }
    setSpeakingId(null);
  };

  const playAudio = async (base64Data: string, messageId: string) => {
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      const audioBuffer = await audioContextRef.current.decodeAudioData(bytes.buffer);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContextRef.current.destination);
      source.onended = () => {
        setSpeakingId(null);
      };
      source.start();
      audioSourceRef.current = source;
    } catch (error) {
      console.error("Playback Error:", error);
      setSpeakingId(null);
    }
  };

  const handleTTS = async (text: string, messageId: string) => {
    if (speakingId === messageId) {
      stopAudio();
      return;
    }

    stopAudio();
    setSpeakingId(messageId);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say clearly: ${text.substring(0, 1000)}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        playAudio(base64Audio, messageId);
      } else {
        setSpeakingId(null);
      }
    } catch (error) {
      console.error("TTS Error:", error);
      setSpeakingId(null);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const shareTranscript = async (method: 'email' | 'whatsapp') => {
    const transcript = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    const subject = `VTU Intelligence Chat Transcript - ${userData.name}`;
    const bodyText = `Hello,\n\nHere is the chat transcript from VTU Intelligence Core:\n\n${transcript}\n\nBest regards,\nVTU Intelligence Core`;

    if (method === 'email') {
      setIsSendingEmail(true);
      try {
        const response = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: userData.email,
            subject: subject,
            text: bodyText,
            html: `<div style="font-family: sans-serif; color: #333;">
              <h2 style="color: #2563eb;">VTU Intelligence Chat Transcript</h2>
              <p>Hello <strong>${userData.name}</strong>,</p>
              <p>Here is your conversation history with the VTU Intelligence Core.</p>
              <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
              <div style="white-space: pre-wrap; background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0;">
                ${transcript.replace(/\n/g, '<br/>')}
              </div>
              <p style="margin-top: 20px; font-size: 12px; color: #64748b;">
                This is an automated message from the VTU Intelligence Core.
              </p>
            </div>`
          })
        });

        if (response.ok) {
          setNotification({ message: 'Transcript sent to your email successfully!', type: 'success' });
        } else {
          throw new Error('Failed to send email');
        }
      } catch (error) {
        console.error('Email error:', error);
        setNotification({ message: 'Using local mail client...', type: 'error' });
        window.location.href = `mailto:${userData.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyText)}`;
      } finally {
        setIsSendingEmail(false);
      }
    } else {
      const cleanPhone = userData.phone.replace(/\D/g, '');
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(subject + '\n\n' + bodyText)}`;
      window.open(waUrl, '_blank');
    }
  };

  const toggleVoiceInput = () => {
    if (!('webkitSpeechRecognition' in window) && !('speechRecognition' in window)) {
      alert('Speech recognition is not supported in your browser.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).speechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + transcript);
    };

    recognition.start();
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
        const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        const prompt = `${SYSTEM_PROMPT}\n\n[USER CONTEXT: Name: ${userData.name}, Email: ${userData.email}]\n\nQUERY: ${input}`;
        
        const history = messages.slice(-10).map(msg => ({
          role: msg.role === 'user' ? 'user' : 'model',
          parts: [{ text: msg.content }]
        }));

        const parts: any[] = [{ text: prompt }];
        if (selectedFile?.type === 'image') {
          const base64Data = selectedFile.data.split(',')[1];
          const mimeType = selectedFile.data.split(';')[0].split(':')[1];
          parts.push({ inlineData: { data: base64Data, mimeType } });
        }

        const result = await ai.models.generateContent({
          model: "gemini-2.0-flash-exp",
          contents: [...history, { role: 'user', parts }],
          config: {
            tools: [{ googleSearchRetrieval: {} }] as any
          }
        });

        const responseText = result.text || "I'm sorry, I couldn't process that request.";
        const groundingMetadata = (result as any).groundingMetadata;
        
        setActiveModel("gemini-2.0-flash-exp (RAG)");
        setMessages(prev => prev.map(m => 
          m.id === botMessageId ? { 
            ...m, 
            content: responseText, 
            isTyping: false,
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
    <div className="flex flex-col h-screen w-full bg-vtu-bg overflow-hidden relative bg-gradient-to-br from-vtu-bg via-white to-vtu-bg/50">
      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border backdrop-blur-md",
              notification.type === 'success' ? "bg-green-500/90 border-green-400 text-white" : "bg-red-500/90 border-red-400 text-white"
            )}
          >
            {notification.type === 'success' ? <Check size={18} /> : <Info size={18} />}
            <span className="font-bold text-sm">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PDF Modal */}
      {viewingPdf && <PDFModal fileUrl={viewingPdf} onClose={() => setViewingPdf(null)} />}

      {/* Lead Capture Overlay */}
      {!isLeadCaptured && (
        <div className="absolute inset-0 z-50 bg-vtu-text-main/5 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-vtu-bg rounded-[32px] shadow-2xl w-full max-w-md overflow-hidden border border-vtu-border"
          >
            <div className="bg-vtu-surface p-8 text-center border-b border-vtu-border">
              <div className="bg-vtu-accent/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-vtu-accent">
                <GraduationCap size={32} />
              </div>
              <h2 className="text-2xl font-black tracking-tight mb-2 text-vtu-text-main">VTU Intelligence</h2>
              <p className="text-vtu-text-muted text-sm font-medium">Kindly provide your details to start the session.</p>
            </div>
            
            <form onSubmit={handleLeadSubmit} className="p-8 space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-vtu-text-muted ml-1">Full Name</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-vtu-text-dim" size={18} />
                  <input 
                    type="text" 
                    required
                    value={userData.name}
                    onChange={(e) => setUserData({...userData, name: e.target.value})}
                    placeholder="John Doe"
                    className="w-full pl-12 pr-4 py-3.5 bg-vtu-bg border border-vtu-border rounded-xl focus:ring-4 focus:ring-vtu-accent/10 focus:border-vtu-accent outline-none transition-all font-medium text-vtu-text-main"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-vtu-text-muted ml-1">Phone Number</label>
                <div className="relative">
                  <ClipboardList className="absolute left-4 top-1/2 -translate-y-1/2 text-vtu-text-dim" size={18} />
                  <input 
                    type="tel" 
                    required
                    value={userData.phone}
                    onChange={(e) => setUserData({...userData, phone: e.target.value})}
                    placeholder="+91 98765 43210"
                    className="w-full pl-12 pr-4 py-3.5 bg-vtu-bg border border-vtu-border rounded-xl focus:ring-4 focus:ring-vtu-accent/10 focus:border-vtu-accent outline-none transition-all font-medium text-vtu-text-main"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-vtu-text-muted ml-1">University Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-vtu-text-dim" size={18} />
                  <input 
                    type="email" 
                    required
                    value={userData.email}
                    onChange={(e) => setUserData({...userData, email: e.target.value})}
                    placeholder="student@vtu.ac.in"
                    className="w-full pl-12 pr-4 py-3.5 bg-vtu-bg border border-vtu-border rounded-xl focus:ring-4 focus:ring-vtu-accent/10 focus:border-vtu-accent outline-none transition-all font-medium text-vtu-text-main"
                  />
                </div>
              </div>

              {leadFormError && (
                <p className="text-red-600 text-xs font-bold text-center">{leadFormError}</p>
              )}

              <button 
                type="submit"
                className="w-full py-4 bg-vtu-accent text-white rounded-xl font-black text-sm uppercase tracking-widest hover:bg-vtu-accent-hover transition-all shadow-lg shadow-vtu-accent/20 mt-4"
              >
                Start Session
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Top Bar */}
      <div className="bg-vtu-bg border-b border-vtu-border px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-vtu-accent/10 p-2 rounded-xl text-vtu-accent relative group">
            <GraduationCap size={24} />
            <Sparkles size={12} className="absolute -top-1 -right-1 text-vtu-accent animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-black text-vtu-text-main tracking-tight text-lg">VTU Intelligence</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-vtu-text-dim flex items-center gap-2">
                {isLeadCaptured ? `Active: ${userData.name}` : 'Awaiting Verification'}
              </span>
            </div>
          </div>
        </div>
          <div className="flex items-center gap-4">
            {isLeadCaptured && (
              <div className="flex items-center bg-vtu-bg border border-vtu-border rounded-xl p-1 gap-1">
                <button 
                  onClick={() => setRagMode(false)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                    !ragMode ? "bg-vtu-surface text-vtu-text-main shadow-sm border border-vtu-border" : "text-vtu-text-muted hover:text-vtu-text-main"
                  )}
                >
                  Standard
                </button>
                <button 
                  onClick={() => setRagMode(true)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                    ragMode ? "bg-vtu-accent text-white shadow-md shadow-vtu-accent/20" : "text-vtu-text-muted hover:text-vtu-text-main"
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
                className="p-2 hover:bg-vtu-bg rounded-lg transition-colors text-vtu-text-muted hover:text-red-600"
                title="Clear History"
              >
                <Trash2 size={18} />
              </button>
            )}
            <QuickLink icon={<Globe size={14} />} label="Results" href="https://results.vtu.ac.in" />
            <QuickLink icon={<BookOpen size={14} />} label="Syllabus" href="https://vtu.ac.in/en/b-e-scheme-syllabus/" />
          </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-8 bg-vtu-bg no-scrollbar">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-8 max-w-3xl mx-auto py-12">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-vtu-accent/10 rounded-[48px] p-10 text-vtu-accent"
            >
              <GraduationCap size={48} />
            </motion.div>
            <div className="space-y-2">
              <h3 className="font-black text-vtu-text-main text-3xl sm:text-4xl tracking-tight">VTU Intelligence</h3>
              <p className="text-vtu-text-muted font-medium text-sm sm:text-lg max-w-xl mx-auto">
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
                    <div className="h-[1px] flex-1 bg-vtu-border" />
                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-vtu-text-dim">New Response</span>
                    <div className="h-[1px] flex-1 bg-vtu-border" />
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
                    "w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 border mt-1 shadow-inner",
                    msg.role === 'user' ? "bg-vtu-accent border-vtu-accent shadow-vtu-accent/20" : "bg-vtu-surface border-vtu-border"
                  )}>
                    {msg.role === 'user' ? <User size={14} className="text-white" /> : <Bot size={14} className="text-vtu-accent" />}
                  </div>
                  
                  <div className={cn(
                    "flex flex-col max-w-[85%] sm:max-w-[75%]",
                    msg.role === 'user' ? "items-end" : "items-start"
                  )}>
                    <div className={cn(
                      "rounded-2xl p-4 sm:p-5 text-left transition-all duration-300",
                      msg.role === 'user' 
                        ? "bg-vtu-accent text-white rounded-tr-none font-medium shadow-lg shadow-vtu-accent/10" 
                        : "glass rounded-tl-none border border-vtu-border/50 text-vtu-text-main"
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
                        <div className="mb-4 sm:mb-6 p-3 sm:p-5 bg-vtu-accent/5 rounded-xl sm:rounded-2xl border border-vtu-accent/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-6">
                          <div className="flex items-center gap-3 sm:gap-4 overflow-hidden">
                            <div className="bg-vtu-accent/10 p-2 sm:p-3 rounded-lg sm:rounded-xl">
                              <FileText className="text-vtu-accent w-5 h-5 sm:w-7 sm:h-7" />
                            </div>
                            <div className="overflow-hidden">
                              <p className="text-sm sm:text-base font-black text-vtu-text-main truncate">{msg.pdf.name}</p>
                              <p className="text-[8px] sm:text-[10px] text-vtu-accent font-black uppercase tracking-widest">Official VTU Document</p>
                            </div>
                          </div>
                          <button 
                            onClick={() => setViewingPdf(msg.pdf!.url)}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 sm:px-6 py-2 sm:py-3 bg-vtu-accent text-white rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black hover:bg-vtu-accent-hover transition-all shadow-lg shadow-vtu-accent/20 shrink-0"
                          >
                            <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> VIEW
                          </button>
                        </div>
                      )}

                      <div className="markdown-container prose prose-neutral prose-sm sm:prose-base max-w-none leading-relaxed">
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
                                        className="p-1.5 bg-vtu-accent text-white rounded-lg hover:bg-vtu-accent-hover"
                                      >
                                        {copiedId === msg.id + '-code' ? <Check size={12} /> : <Copy size={12} />}
                                      </button>
                                    </div>
                                    <SyntaxHighlighter
                                      style={vscDarkPlus}
                                      language={match[1]}
                                      PreTag="div"
                                      className="rounded-xl !bg-vtu-text-main !p-4 border border-vtu-border overflow-x-auto"
                                      {...props}
                                    >
                                      {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                  </div>
                                ) : (
                                  <code className={cn("bg-vtu-surface text-vtu-accent px-1 py-0.5 rounded font-mono text-[10px] sm:text-sm", className)} {...props}>
                                    {children}
                                  </code>
                                );
                              },
                              table: ({ children }) => (
                                <div className="overflow-x-auto my-4 rounded-xl border border-vtu-border bg-white shadow-sm">
                                  <table className="min-w-full border-collapse">
                                    {children}
                                  </table>
                                </div>
                              ),
                              thead: ({ children }) => <thead className="bg-vtu-surface border-b border-vtu-border">{children}</thead>,
                              th: ({ children }) => <th className="px-4 py-3 text-left text-[9px] font-black text-vtu-text-dim uppercase tracking-widest">{children}</th>,
                              tr: ({ children }) => <tr className="hover:bg-vtu-surface/50 transition-colors">{children}</tr>,
                              td: ({ children }) => <td className="px-4 py-3 text-xs sm:text-sm text-vtu-text-main border-t border-vtu-border">{children}</td>,
                              strong: ({ children }) => <strong className="text-vtu-text-main font-bold">{children}</strong>,
                              h1: ({ children }) => <h1 className="text-lg sm:text-xl font-black text-vtu-text-main mb-3 tracking-tight">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-base sm:text-lg font-black text-vtu-text-main mb-2 tracking-tight">{children}</h2>,
                              p: ({ children }) => <p className="mb-3 text-vtu-text-main font-medium leading-relaxed text-sm last:mb-0">{children}</p>,
                              ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1 text-vtu-text-main text-sm">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1 text-vtu-text-main text-sm">{children}</ol>,
                              li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>

                          {msg.role === 'bot' && (
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
                      </div>

                        {msg.role === 'bot' && !msg.isTyping && extractPdfLinks(msg.content).length > 0 && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {extractPdfLinks(msg.content).map((link, idx) => (
                              <a
                                key={idx}
                                href={link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-4 py-2 bg-vtu-accent text-white rounded-xl text-[10px] sm:text-xs font-black hover:bg-vtu-accent-hover transition-all shadow-lg shadow-vtu-accent/10 group/btn"
                              >
                                <FileText size={14} className="group-hover:scale-110 transition-transform" />
                                DOWNLOAD CIRCULAR (PDF)
                              </a>
                            ))}
                          </div>
                        )}

                        {msg.groundingMetadata?.groundingChunks && (
                          <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-vtu-border">
                            <div className="flex items-center gap-2 mb-3 sm:mb-4">
                              <Search size={12} className="text-vtu-accent" />
                              <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.3em] text-vtu-accent">Verified Grounding Sources</p>
                            </div>
                            <div className="flex flex-wrap gap-2 sm:gap-3">
                              {msg.groundingMetadata.groundingChunks.map((chunk: any, i: number) => (
                                chunk.web && (
                                  <a 
                                    key={i} 
                                    href={chunk.web.uri} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-[8px] sm:text-[10px] bg-vtu-surface hover:bg-vtu-bg px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl border border-vtu-border text-vtu-text-muted font-black transition-all flex items-center gap-1.5 sm:gap-2 shadow-sm hover:border-vtu-accent hover:text-vtu-accent"
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
                        <p className="text-[8px] sm:text-[10px] font-black text-vtu-text-muted uppercase tracking-widest">
                          {msg.role === 'user' ? 'Student Query' : 'Intelligence Core'}
                        </p>
                        <span className="w-1 h-1 bg-vtu-border rounded-full" />
                        <p className="text-[8px] sm:text-[10px] font-bold text-vtu-text-dim flex items-center gap-1">
                          <Clock size={8} />
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {msg.role === 'bot' && msg.content && !msg.isTyping && (
                        <div className="flex items-center gap-1 ml-auto">
                          <button 
                            onClick={() => handleTTS(msg.content, msg.id)}
                            className={cn(
                              "p-1.5 rounded-md transition-all hover:bg-vtu-bg flex items-center gap-1",
                              speakingId === msg.id ? "text-vtu-accent bg-vtu-accent/10 animate-pulse" : "text-vtu-text-dim"
                            )}
                            title="Speak message"
                          >
                            {speakingId === msg.id ? <VolumeX size={12} /> : <Volume2 size={12} />}
                          </button>
                          <div className="w-[1px] h-3 bg-vtu-border mx-0.5" />
                          <button 
                            onClick={() => handleFeedback(msg.id, 'up')}
                            className={cn(
                              "p-1 rounded-md transition-colors hover:bg-vtu-bg",
                              msg.feedback === 'up' ? "text-green-500 bg-green-50" : "text-vtu-text-dim"
                            )}
                          >
                            <ThumbsUp size={12} />
                          </button>
                          <button 
                            onClick={() => handleFeedback(msg.id, 'down')}
                            className={cn(
                              "p-1 rounded-md transition-colors hover:bg-vtu-bg",
                              msg.feedback === 'down' ? "text-red-500 bg-red-50" : "text-vtu-text-dim"
                            )}
                          >
                            <ThumbsDown size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
              </React.Fragment>
            );
          })}
        </AnimatePresence>
        
        {isLoading && !messages[messages.length - 1]?.content && (
          <div className="flex gap-3 sm:gap-4 max-w-4xl mx-auto">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-vtu-surface border border-vtu-border flex items-center justify-center shrink-0">
              <Bot size={14} className="text-vtu-text-dim" />
            </div>
            <div className="bg-vtu-surface rounded-2xl p-4 rounded-tl-none border border-vtu-border flex items-center gap-3 shadow-sm">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <motion.div 
                    key={i}
                    animate={{ y: [0, -4, 0] }} 
                    transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                    className="w-1 h-1 bg-vtu-text-dim rounded-full" 
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-vtu-surface border-t border-vtu-border p-4 sm:p-6">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length > 0 && (
            <div className="flex items-center gap-2 justify-center pb-2">
              <button 
                onClick={() => shareTranscript('email')}
                disabled={isSendingEmail}
                className="flex items-center gap-2 px-4 py-2 bg-vtu-bg hover:bg-vtu-surface text-vtu-text-muted rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-vtu-border disabled:opacity-50"
              >
                {isSendingEmail ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} 
                Email Transcript
              </button>
              <button 
                onClick={() => shareTranscript('whatsapp')}
                className="flex items-center gap-2 px-4 py-2 bg-green-50 hover:bg-green-100 text-green-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-green-100"
              >
                <MessageSquare size={14} /> WhatsApp
              </button>
            </div>
          )}
          {selectedFile && (
          <div className="relative inline-block group mb-4">
            {selectedFile.type === 'image' ? (
              <img 
                src={selectedFile.data} 
                alt="Preview" 
                className="h-16 w-16 sm:h-24 sm:w-24 object-cover rounded-xl border border-vtu-border shadow-lg"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-16 w-16 sm:h-24 sm:w-24 bg-vtu-bg rounded-xl border border-vtu-border shadow-lg flex flex-col items-center justify-center text-center p-2">
                <FileText className="text-vtu-text-dim mb-1 w-6 h-6" />
                <p className="text-[6px] font-black text-vtu-text-muted truncate w-full">{selectedFile.name}</p>
              </div>
            )}
            <button 
              onClick={clearFile}
              className="absolute -top-1 -right-1 bg-vtu-accent text-white rounded-full p-1 shadow-lg hover:bg-vtu-accent-hover transition-all"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
        
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="rounded-xl bg-vtu-bg border border-vtu-border p-3 sm:p-4 text-vtu-text-dim hover:bg-vtu-surface hover:text-vtu-text-muted transition-all shrink-0"
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
              className="w-full rounded-2xl border border-vtu-border p-3 sm:p-4 pr-20 sm:pr-24 text-sm min-h-[48px] max-h-32 focus:ring-4 focus:ring-vtu-accent/5 focus:border-vtu-accent focus:outline-none resize-none bg-vtu-bg font-medium text-vtu-text-main placeholder:text-vtu-text-dim"
              rows={1}
            />
            <div className="absolute right-10 bottom-2 flex items-center gap-1">
              <button
                onClick={toggleVoiceInput}
                className={cn(
                  "p-1.5 rounded-lg transition-all",
                  isListening ? "bg-red-600/10 text-red-600 animate-pulse" : "text-vtu-text-dim hover:text-vtu-text-main hover:bg-vtu-bg"
                )}
                title={isListening ? "Listening..." : "Voice Input"}
              >
                {isListening ? <MicOff size={18} /> : <Mic size={18} />}
              </button>
            </div>
            <button
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && !selectedFile)}
              className="absolute right-2 bottom-2 p-2 sm:p-2.5 bg-vtu-accent text-white rounded-xl hover:bg-vtu-accent-hover disabled:opacity-20 disabled:cursor-not-allowed transition-all shadow-lg shadow-vtu-accent/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
        
        <div className="mt-4 flex flex-col items-center justify-center gap-1 border-t border-vtu-border pt-4">
          <p className="text-[9px] font-black text-vtu-text-dim uppercase tracking-[0.2em]">
            © 2026 VTU Intelligence Core
          </p>
          <p className="text-[8px] font-bold text-vtu-text-dim">
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
      className="flex items-center gap-2 px-2 sm:px-3 py-1.5 rounded-lg bg-vtu-surface border border-vtu-border text-vtu-text-muted hover:border-vtu-accent hover:text-vtu-accent transition-all shadow-sm shrink-0 group"
    >
      <div className="text-vtu-text-dim group-hover:text-vtu-accent transition-colors">{icon}</div>
      <span className="text-[10px] font-black uppercase tracking-widest hidden md:inline">{label}</span>
    </a>
  );
}

function SuggestionCard({ icon, title, desc, onClick }: { icon: React.ReactNode, title: string, desc: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-start p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-vtu-surface border border-vtu-border text-left hover:border-vtu-accent hover:shadow-xl transition-all group"
    >
      <div className="bg-vtu-bg p-2 sm:p-3 rounded-lg sm:rounded-xl text-vtu-text-dim group-hover:bg-vtu-accent/10 group-hover:text-vtu-accent transition-all mb-3 sm:mb-4">
        {icon}
      </div>
      <h4 className="font-black text-vtu-text-main tracking-tight text-xs sm:text-sm mb-1">{title}</h4>
      <p className="text-vtu-text-muted font-bold leading-relaxed text-[8px] sm:text-[10px]">{desc}</p>
    </button>
  );
}
