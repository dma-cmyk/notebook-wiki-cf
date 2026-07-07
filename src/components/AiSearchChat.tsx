/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import {
  MessageSquare,
  Send,
  Bot,
  Sparkles,
  Loader2,
  ArrowRight,
  Tag,
  ExternalLink,
  RotateCcw,
  Mic,
  MicOff,
  Paperclip,
  X,
  File,
  Folder,
  Image as ImageIcon,
  AlertCircle,
  Link2,
  Camera
} from "lucide-react";
import { Memo } from "../types";
import { ThemePreset } from "../App";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { MultimediaModal } from "./MultimediaModal";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  matchedMemoIds?: string[];
}

interface AiSearchChatProps {
  memos: Memo[];
  activeTheme: ThemePreset;
  token: string | null;
  onSelectMemo: (id: string) => void;
  setActiveTab?: (tab: "memo" | "graph") => void;
  onRefreshMemosAndSelect?: (selectId?: string) => Promise<void>;
}

const DEFAULT_SUGGESTIONS = [
  "タスク管理に関するメモはありますか？",
  "最近作成されたメモを要約して教えてください。",
  "仕事や勉強に関連するメモとタグを教えてください。",
  "お笑いやアイディアに関するメモを検索して",
];

export function AiSearchChat({ memos, activeTheme, token, onSelectMemo, setActiveTab, onRefreshMemosAndSelect }: AiSearchChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `こんにちは！LLM Wiki AIアシスタントです。

メモの検索だけでなく、新しいメモの作成や既存のメモの編集（追加や更新）を私に指示することができます！
「〜について新しいメモを作って」「〜というメモに〇〇を追記して」のように指示してみてください。`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // File Attachment states and interfaces
  interface AttachedFile {
    id: string;
    name: string;
    type: string;
    content: string;
    isAnalyzing: boolean;
    error?: string;
    url?: string;
  }
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputVal, setUrlInputVal] = useState("");
  const [showMultimediaModal, setShowMultimediaModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleMultimediaResult = (title: string, content: string) => {
    const id = crypto.randomUUID();
    const newFile: AttachedFile = {
      id,
      name: title,
      type: "text/markdown",
      content,
      isAnalyzing: false,
    };
    setAttachedFiles((prev) => [...prev, newFile]);
  };

  const handleResetChat = () => {
    setMessages([
      {
        role: "assistant",
        content: `こんにちは！LLM Wiki AIアシスタントです。

メモの検索だけでなく、新しいメモの作成や既存のメモの編集（追加や更新）を私に指示することができます！
「〜について新しいメモを作って」「〜というメモに〇〇を追記して」のように指示してみてください。`,
      },
    ]);
    setInput("");
    setAttachedFiles([]);
  };

  // Helper for recursive folder tree traversal
  const traverseFileTree = async (entry: any, fileList: File[]) => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        entry.file(resolve, reject);
      });
      fileList.push(file);
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const readAllEntries = async (reader: any): Promise<any[]> => {
        let allEntries: any[] = [];
        const readBatch = async () => {
          const batch = await new Promise<any[]>((resolve, reject) => {
            reader.readEntries(resolve, reject);
          });
          if (batch.length > 0) {
            allEntries = allEntries.concat(batch);
            await readBatch();
          }
        };
        await readBatch();
        return allEntries;
      };
      try {
        const entries = await readAllEntries(dirReader);
        for (const childEntry of entries) {
          await traverseFileTree(childEntry, fileList);
        }
      } catch (err) {
        console.error("Error reading directory entries:", err);
      }
    }
  };

  const getMimeType = (fileName: string, originalType: string): string => {
    if (originalType && originalType !== "application/octet-stream" && originalType.includes("/")) {
      return originalType;
    }
    const ext = fileName.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "png": return "image/png";
      case "jpg":
      case "jpeg": return "image/jpeg";
      case "gif": return "image/gif";
      case "webp": return "image/webp";
      case "bmp": return "image/bmp";
      case "pdf": return "application/pdf";
      case "mp3": return "audio/mp3";
      case "wav": return "audio/wav";
      case "m4a": return "audio/m4a";
      case "txt": return "text/plain";
      case "md": return "text/markdown";
      case "json": return "application/json";
      case "csv": return "text/csv";
      default: return originalType || "application/octet-stream";
    }
  };

  const handleUploadFiles = async (files: File[]) => {
    const newAttached = files.map((file) => {
      const id = crypto.randomUUID();
      const mimeType = getMimeType(file.name, file.type);
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const isText = mimeType.startsWith("text/") || [
        "txt", "md", "json", "csv", "xml", "ini", "yaml", "yml", 
        "js", "ts", "jsx", "tsx", "html", "css", "py", "sh", "sql", 
        "java", "c", "cpp", "h", "cs", "go", "rs", "php", "rb", "pl", 
        "r", "swift", "kt", "scala", "m", "log", "tsv"
      ].includes(ext);

      // Start async file processor
      setTimeout(() => {
        processFile(id, file, mimeType, isText);
      }, 0);

      return {
        id,
        name: file.name,
        type: mimeType,
        content: "",
        isAnalyzing: true,
      };
    });

    setAttachedFiles((prev) => [...prev, ...newAttached]);
  };

  const processFile = async (id: string, file: File, mimeType: string, isText: boolean) => {
    try {
      let uploadedUrl = "";

      // Convert to base64
      const base64Promise = new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1] || result;
          resolve(base64);
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });
      const base64Data = await base64Promise;

      // Upload file to /api/upload
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fileData: base64Data,
          mimeType,
          fileName: file.name,
        }),
      });

      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        if (uploadData.success && uploadData.url) {
          uploadedUrl = uploadData.url;
        }
      }

      if (isText) {
        const reader = new FileReader();
        const contentPromise = new Promise<string>((resolve, reject) => {
          reader.onload = (e) => resolve(e.target?.result as string || "");
          reader.onerror = (err) => reject(err);
        });
        reader.readAsText(file);
        const content = await contentPromise;
        setAttachedFiles((prev) =>
          prev.map((f) => (f.id === id ? { ...f, content, url: uploadedUrl, isAnalyzing: false } : f))
        );
      } else {
        const res = await fetch("/api/memos/analyze-file", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            fileData: base64Data,
            mimeType,
            fileName: file.name,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP error ${res.status}`);
        }

        const data = await res.json();
        setAttachedFiles((prev) =>
          prev.map((f) =>
            f.id === id
              ? {
                  ...f,
                  content: data.text || `【解析結果のテキスト】\n${data.extractedText || ""}\n\n【要約・詳細】\n${data.summary || ""}`,
                  url: uploadedUrl,
                  isAnalyzing: false,
                }
              : f
          )
        );
      }
    } catch (err: any) {
      console.error(`Failed to process file ${file.name}:`, err);
      setAttachedFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                isAnalyzing: false,
                error: err.message || "ファイルの解析に失敗しました。",
              }
            : f
        )
      );
    }
  };

  const handleLoadFromUrl = async (url: string) => {
    if (!url.trim()) return;
    
    // Add protocol if missing
    let targetUrl = url.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = "https://" + targetUrl;
    }

    const id = crypto.randomUUID();
    let displayUrl = targetUrl;
    try {
      const parsed = new URL(targetUrl);
      displayUrl = parsed.hostname + (parsed.pathname !== "/" ? parsed.pathname : "");
    } catch (e) {}

    const name = `URL: ${displayUrl}`;

    setAttachedFiles((prev) => [
      ...prev,
      {
        id,
        name,
        type: "webpage/url",
        content: "",
        isAnalyzing: true,
      },
    ]);

    try {
      const res = await fetch("/api/memos/fetch-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ url: targetUrl }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }

      const data = await res.json();
      setAttachedFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                content: data.text || "",
                type: data.mimeType || "text/markdown",
                isAnalyzing: false,
              }
            : f
        )
      );
    } catch (err: any) {
      console.error(`Failed to process URL ${targetUrl}:`, err);
      setAttachedFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? {
                ...f,
                isAnalyzing: false,
                error: err.message || "URLの取得または解析に失敗しました。",
              }
            : f
        )
      );
    }
  };

  const handleRemoveFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleUploadFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const items = e.dataTransfer.items;
    if (!items) return;

    const files: File[] = [];
    const promises: Promise<void>[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const entry = item.webkitGetAsEntry();
        if (entry) {
          promises.push(traverseFileTree(entry, files));
        } else {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
    }

    await Promise.all(promises);
    if (files.length > 0) {
      handleUploadFiles(files);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      handleUploadFiles(files);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Dynamic Query Suggestions states
  const [suggestions, setSuggestions] = useState<string[]>(DEFAULT_SUGGESTIONS);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);

  // Voice Input states
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  const voiceTextRef = useRef("");
  const inputBeforeRecordRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isVoiceInputActiveRef = useRef(false);

  // Track latest input value using a ref to prevent recreating speech recognition instance on every keystroke
  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  // Auto-resize textarea when text changes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const isDark = activeTheme.isDark;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, isProcessingVoice]);

  // Load Speech Recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        const rec = new SpeechRecognitionClass();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "ja-JP";

        rec.onstart = () => {
          setIsRecording(true);
        };

        rec.onend = async () => {
          if (!isVoiceInputActiveRef.current) {
            setIsRecording(false);
            const rawText = voiceTextRef.current.trim();
            if (rawText) {
              await handleProcessVoice(rawText);
            }
          } else {
            // ユーザーの意図しない自動停止時は自動で再起動
            try {
              rec.start();
            } catch (err) {
              console.error("Failed to restart speech recognition:", err);
              // 少し遅延させて再開を試みる（安全策）
              setTimeout(() => {
                if (isVoiceInputActiveRef.current) {
                  try {
                    rec.start();
                  } catch (e) {
                    console.error("Failed to restart speech recognition in timeout:", e);
                    setIsRecording(false);
                    isVoiceInputActiveRef.current = false;
                  }
                }
              }, 300);
            }
          }
        };

        rec.onerror = (e: any) => {
          console.error("Speech recognition error:", e);
          // no-speech 以外の深刻なエラー時は自動再開しないようにフラグを折る
          if (e.error !== "no-speech") {
            isVoiceInputActiveRef.current = false;
            setIsRecording(false);
          }
        };

        rec.onresult = (event: any) => {
          let interimTranscript = "";
          let finalTranscript = "";

          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript;
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }

          if (finalTranscript) {
            voiceTextRef.current += finalTranscript;
          }

          // Accumulate speech real-time and update input state
          const currentVoiceText = voiceTextRef.current + interimTranscript;
          setInput(inputBeforeRecordRef.current + currentVoiceText);
        };

        setRecognition(rec);
      }
    }
  }, []);

  // Fetch AI suggested queries based on memos
  useEffect(() => {
    const fetchDynamicSuggestions = async () => {
      if (!token) return;
      setIsFetchingSuggestions(true);
      try {
        const res = await fetch("/api/memos/dynamic-suggestions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.suggestions && Array.isArray(data.suggestions)) {
            setSuggestions(data.suggestions);
          }
        }
      } catch (err) {
        console.error("Failed to load suggested queries:", err);
      } finally {
        setIsFetchingSuggestions(false);
      }
    };

    fetchDynamicSuggestions();
  }, [token, memos.length]);

  const handleProcessVoice = async (rawText: string) => {
    setIsProcessingVoice(true);
    try {
      const res = await fetch("/api/memos/clean-voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ transcript: rawText }),
      });
      if (res.ok) {
        const data = await res.json();
        setInput(inputBeforeRecordRef.current + (data.cleaned || rawText));
      } else {
        setInput(inputBeforeRecordRef.current + rawText);
      }
    } catch (err) {
      console.error("Error cleaning voice input text:", err);
      setInput(inputBeforeRecordRef.current + rawText);
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const toggleRecording = () => {
    if (!recognition) {
      alert("お使いのブラウザは音声入力をサポートしていません。Google Chromeなどの音声認識対応ブラウザをお試しください。");
      return;
    }
    if (isVoiceInputActiveRef.current) {
      isVoiceInputActiveRef.current = false;
      recognition.stop();
    } else {
      isVoiceInputActiveRef.current = true;
      voiceTextRef.current = "";
      inputBeforeRecordRef.current = inputRef.current;
      recognition.start();
    }
  };

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query && attachedFiles.length === 0) return;

    // Check if any files are still being processed
    const analyzing = attachedFiles.some((f) => f.isAnalyzing);
    if (analyzing) {
      alert("ファイルを解析中です。完了するまでしばらくお待ちください。");
      return;
    }

    if (!textToSend) {
      setInput("");
    }

    // Format the display content for the chat bubble
    const displayContent = attachedFiles.length > 0 
      ? `${query || "ファイルを読み込ませる"}\n\n📎 添付ファイル: ${attachedFiles.map(f => f.name).join(", ")}`
      : query;

    // Format the actual text to send to AI
    let finalQuery = query || "添付されたファイルを読み込んで、新しいメモを作成する、あるいは内容をまとめてください。";
    if (attachedFiles.length > 0) {
      finalQuery += "\n\n---\n📎 【ユーザーが添付したファイルの情報】";
      attachedFiles.forEach((file) => {
        finalQuery += `\n\n■ ファイル名: ${file.name} (種類: ${file.type}${file.url ? `, URL: ${file.url}` : ""})`;
        if (file.error) {
          finalQuery += `\n(エラー: ${file.error})`;
        } else {
          finalQuery += `\n【内容/解析テキスト】:\n${file.content}`;
        }
      });
    }

    const newMessages: ChatMessage[] = [...messages, { role: "user", content: displayContent }];
    setMessages(newMessages);
    setIsLoading(true);

    // Keep track of files to clear
    const filesToClear = [...attachedFiles];
    setAttachedFiles([]);

    try {
      // Map chat history to standard format for endpoint
      const history = newMessages.slice(0, -1).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/memos/search-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: finalQuery,
          history,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response,
          matchedMemoIds: data.matchedMemoIds,
        },
      ]);

      // If an action was executed successfully (like create or update), refresh the memo list and select the memo
      if (data.actionResult && data.actionResult.memoId) {
        onRefreshMemosAndSelect?.(data.actionResult.memoId);
      }
    } catch (err: any) {
      console.error("AI chat search failed:", err);
      // Restore files on failure so user doesn't lose them
      setAttachedFiles(filesToClear);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "申し訳ありません。AIによる検索処理中にエラーが発生しました。設定画面でAPIキーやプロバイダーが正しく設定されているか確認してください。",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    if (isLoading) return;
    handleSend(suggestion);
  };

  return (
    <div 
      className={`flex-1 flex flex-col h-full min-h-0 relative ${activeTheme.bg} ${activeTheme.textMain}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Overlay */}
      {isDragging && (
        <div className="absolute inset-0 bg-indigo-500/10 backdrop-blur-[2px] border-2 border-dashed border-indigo-500 rounded-2xl z-50 flex flex-col items-center justify-center pointer-events-none">
          <div className="p-4 rounded-full bg-indigo-500 text-white shadow-lg animate-bounce mb-3">
            <Paperclip className="w-8 h-8" />
          </div>
          <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-950 px-3 py-1.5 rounded-lg shadow-sm">
            ファイルをドロップしてAIに読み込ませる
          </p>
          <p className="text-xs text-indigo-500/80 dark:text-indigo-400/80 mt-1.5 font-medium bg-white/80 dark:bg-slate-950/80 px-2 py-1 rounded">
            ※フォルダごとドロップも可能です
          </p>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 min-h-0 pt-6">
        {messages.map((msg, idx) => {
          const isUser = msg.role === "user";
          return (
            <div key={idx} className={`flex gap-3 max-w-4xl ${isUser ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
              {/* Avatar Icon */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${
                  isUser
                    ? `${activeTheme.accentBg} border-transparent text-white`
                    : `${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain}`
                }`}
              >
                {isUser ? (
                  <span className="text-xs font-semibold uppercase">Me</span>
                ) : (
                  <Bot className={`w-4 h-4 ${activeTheme.accentText}`} />
                )}
              </div>

              {/* Message Bubble */}
              <div className="flex-1 min-w-0 space-y-3">
                <div
                  className={`p-4 rounded-2xl shadow-sm border ${
                    isUser
                      ? `${activeTheme.accentBg} border-transparent text-white rounded-tr-none`
                      : `${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain} rounded-tl-none`
                  }`}
                >
                  {isUser ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                  ) : (
                    <div className="text-sm leading-relaxed">
                      <MarkdownRenderer content={msg.content} activeTheme={activeTheme} token={token || undefined} />
                    </div>
                  )}
                </div>

                {/* Suggested Quick Queries (only on first bot welcome bubble) */}
                {!isUser && idx === 0 && suggestions.length > 0 && (
                  <div className="flex flex-col gap-2 pt-1 pl-1 max-w-lg">
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${activeTheme.textMuted}`}>クイック提案:</p>
                    <div className="flex flex-col gap-2">
                      {suggestions.map((s, sIdx) => (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => handleSuggestionClick(s)}
                          className={`text-left px-3.5 py-2.5 rounded-xl border text-xs font-medium cursor-pointer transition-all hover:scale-[1.01] flex items-center justify-between gap-2 shadow-sm ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain} hover:${activeTheme.tagBg} hover:${activeTheme.accentBorder}`}
                        >
                          <span className="truncate">{s}</span>
                          <ArrowRight className={`w-3.5 h-3.5 shrink-0 opacity-60 text-indigo-500`} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggested/Matched Memos Cards */}
                {!isUser && msg.matchedMemoIds && msg.matchedMemoIds.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 pl-1">
                    {msg.matchedMemoIds.map((id) => {
                      const memo = memos.find((m) => m.id === id);
                      if (!memo) return null;
                      return (
                        <div
                          key={id}
                          className={`p-3.5 rounded-xl border shadow-sm flex flex-col justify-between transition-all duration-200 hover:scale-[1.01] hover:shadow-md ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain}`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-1.5 mb-1.5">
                              <h4 className="font-display font-semibold text-sm truncate" title={memo.title}>
                                {memo.title}
                              </h4>
                              <span className="text-[9px] font-mono whitespace-nowrap opacity-60">
                                {new Date(memo.updatedAt).toLocaleDateString("ja-JP", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            </div>
                            <p className={`text-xs line-clamp-2 mb-3.5 leading-relaxed ${activeTheme.textMuted}`}>
                              {memo.summary || memo.content || "内容がありません。"}
                            </p>
                          </div>

                          <div className="space-y-3">
                            {memo.tags && memo.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {memo.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className={`text-[9px] font-medium px-1.5 py-0.5 rounded-md flex items-center gap-0.5 ${activeTheme.tagBg} ${activeTheme.textMuted}`}
                                  >
                                    <Tag className="w-2.5 h-2.5 opacity-60" />
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            <button
                              onClick={() => {
                                onSelectMemo(memo.id);
                                setActiveTab("memo");
                              }}
                              className={`w-full py-1.5 rounded-lg border text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors ${activeTheme.border} ${activeTheme.textMain} hover:${activeTheme.tagBg}`}
                            >
                              <span>このメモを開いて編集する</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-3 max-w-4xl mr-auto">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${activeTheme.cardBg} ${activeTheme.border}`}>
              <Bot className={`w-4 h-4 ${activeTheme.accentText}`} />
            </div>
            <div className={`p-4 rounded-2xl shadow-sm border rounded-tl-none flex items-center gap-2 text-xs font-semibold ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMuted}`}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>AIがメモを検索して回答を生成中...</span>
            </div>
          </div>
        )}

        {isProcessingVoice && (
          <div className="flex gap-3 max-w-4xl mr-auto">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border shadow-sm ${activeTheme.cardBg} ${activeTheme.border}`}>
              <Sparkles className={`w-4 h-4 ${activeTheme.accentText}`} />
            </div>
            <div className={`p-4 rounded-2xl shadow-sm border rounded-tl-none flex items-center gap-2 text-xs font-semibold ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMuted}`}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>AIが音声入力の言い間違いやブレを補正中...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input form */}
      <div className="p-4 sm:p-6 shrink-0 border-t" style={{ borderColor: "var(--color-border, currentColor)" }}>
        <div className="max-w-4xl mx-auto">
          {/* Attached Files List */}
          {attachedFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3 max-h-24 overflow-y-auto py-1">
              {attachedFiles.map((file) => (
                <div
                  key={file.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow-sm transition-all ${
                    file.error
                      ? (isDark ? "border-red-900/30 bg-red-950/20 text-red-400" : "border-red-300 bg-red-50 text-red-700")
                      : file.isAnalyzing
                      ? (isDark ? "border-amber-900/30 bg-amber-950/20 text-amber-300" : "border-amber-200 bg-amber-50 text-amber-800")
                      : (isDark ? "border-indigo-900/30 bg-indigo-950/20 text-indigo-300" : "border-indigo-200 bg-indigo-50 text-indigo-700")
                  }`}
                >
                  {file.isAnalyzing ? (
                    <Loader2 className="w-3 h-3 animate-spin text-amber-500 shrink-0" />
                  ) : file.error ? (
                    <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                  ) : file.type.startsWith("image/") ? (
                    <ImageIcon className="w-3 h-3 text-indigo-500 shrink-0" />
                  ) : file.type.startsWith("text/") ? (
                    <File className="w-3 h-3 text-emerald-500 shrink-0" />
                  ) : (
                    <File className="w-3 h-3 text-indigo-400 shrink-0" />
                  )}
                  <span className="max-w-[150px] truncate font-medium" title={file.name}>
                    {file.name}
                  </span>
                  {file.isAnalyzing && <span className="opacity-60 text-[10px] shrink-0">(解析中...)</span>}
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(file.id)}
                    className={`p-0.5 rounded transition-colors cursor-pointer shrink-0 ${isDark ? "hover:bg-indigo-950" : "hover:bg-indigo-100"}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* URL Input Box */}
          {showUrlInput && (
            <div className={`mb-3 p-3.5 rounded-2xl border flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs shadow-md transition-all ${
              isDark ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-300 text-slate-800"
            }`}>
              <div className="flex items-center gap-1.5 shrink-0">
                <Link2 className="w-3.5 h-3.5 text-indigo-500" />
                <span className="font-bold">URLから読み込み:</span>
              </div>
              <input
                type="url"
                value={urlInputVal}
                onChange={(e) => setUrlInputVal(e.target.value)}
                placeholder="https://example.com/article"
                className={`flex-1 px-3 py-2 rounded-xl border outline-none font-mono text-xs ${
                  isDark ? "bg-slate-900 border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-indigo-500" : "bg-white border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-indigo-600"
                }`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (urlInputVal.trim()) {
                      handleLoadFromUrl(urlInputVal.trim());
                      setUrlInputVal("");
                      setShowUrlInput(false);
                    }
                  }
                }}
              />
              <div className="flex items-center gap-1.5 shrink-0 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (urlInputVal.trim()) {
                      handleLoadFromUrl(urlInputVal.trim());
                      setUrlInputVal("");
                      setShowUrlInput(false);
                    }
                  }}
                  className={`px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer ${activeTheme.accentBg} text-white hover:${activeTheme.accentBgHover}`}
                >
                  読み込む
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUrlInput(false);
                    setUrlInputVal("");
                  }}
                  className={`px-3 py-2 rounded-xl border font-semibold text-xs transition-all cursor-pointer ${
                    isDark ? "hover:bg-slate-800/50" : "hover:bg-slate-200/50"
                  } ${activeTheme.border} ${activeTheme.textMuted}`}
                >
                  キャンセル
                </button>
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="relative"
          >
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              multiple
              accept="*"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {/* Container for input area and icons */}
            <div
              className={`w-full rounded-2xl border shadow-md outline-none transition-all focus-within:ring-2 flex flex-col ${
                isDark
                  ? "bg-slate-900 border-slate-800 focus-within:border-indigo-500 focus-within:ring-indigo-500/20"
                  : "bg-white border-slate-300 focus-within:border-indigo-600 focus-within:ring-indigo-600/10"
              }`}
            >
              {/* Textarea Input (On Top - Takes Full Width) */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter") {
                    if (e.shiftKey) {
                      // Shift + Enter allows newline
                      return;
                    } else {
                      // Enter alone sends message
                      e.preventDefault();
                      handleSend();
                    }
                  }
                }}
                onPaste={handlePaste}
                disabled={isLoading || isProcessingVoice}
                rows={1}
                placeholder={
                  isRecording
                    ? "マイクに向かってお話しください..."
                    : isProcessingVoice
                    ? "AIが音声の言い間違いをきれいに補正しています..."
                    : "メッセージを入力、またはファイル・フォルダをドラッグ＆ドロップ..."
                }
                className={`w-full py-3.5 px-4 outline-none text-sm bg-transparent border-0 ring-0 focus:ring-0 resize-none max-h-44 overflow-y-auto font-sans ${
                  isDark ? "text-slate-100 placeholder:text-slate-500" : "text-slate-900 placeholder:text-slate-400"
                }`}
                style={{ height: "auto" }}
              />

              {/* Bottom Actions Toolbar */}
              <div className={`flex items-center justify-between border-t px-2 py-1.5 rounded-b-2xl ${
                isDark 
                  ? "border-slate-800/60 bg-slate-900/50" 
                  : "border-slate-150 bg-slate-50"
              }`}>
                {/* Left Actions: File, Camera, URL, Reset */}
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isLoading || isProcessingVoice}
                    title="ファイルを添付、またはフォルダから一括読み込み"
                    className={`p-2 rounded-xl cursor-pointer transition-colors ${activeTheme.textMuted} hover:${activeTheme.accentText}`}
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowMultimediaModal(true)}
                    disabled={isLoading || isProcessingVoice}
                    title="カメラを起動して写真・動画の撮影、またはマイク録音から読み込み"
                    className={`p-2 rounded-xl cursor-pointer transition-colors ${activeTheme.textMuted} hover:${activeTheme.accentText}`}
                  >
                    <Camera className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowUrlInput(!showUrlInput)}
                    disabled={isLoading || isProcessingVoice}
                    title="ウェブページやファイルのURLから読み込み"
                    className={`p-2 rounded-xl cursor-pointer transition-colors ${activeTheme.textMuted} hover:${activeTheme.accentText} ${
                      showUrlInput ? (isDark ? "bg-indigo-950/40 text-indigo-400" : "bg-indigo-50 text-indigo-600") : ""
                    }`}
                  >
                    <Link2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={handleResetChat}
                    disabled={isLoading}
                    title="チャット履歴をリセット"
                    className={`p-2 rounded-xl cursor-pointer transition-colors ${activeTheme.textMuted} hover:text-red-500`}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>

                {/* Right Actions: Voice & Send */}
                <div className="flex items-center gap-1.5">
                  {/* Voice input mic button */}
                  <button
                    type="button"
                    onClick={toggleRecording}
                    disabled={isLoading || isProcessingVoice}
                    title={isRecording ? "音声認識を完了" : "音声入力 (AI言い間違い自動修正機能付き)"}
                    className={`p-2 rounded-xl cursor-pointer transition-all flex items-center justify-center ${
                      isRecording
                        ? "bg-red-500 text-white animate-pulse shadow-sm"
                        : isProcessingVoice
                        ? "bg-amber-100 text-amber-700 shadow-sm"
                        : `${activeTheme.tagBg} ${activeTheme.textMain} hover:opacity-85`
                    }`}
                  >
                    {isProcessingVoice ? (
                      <Sparkles className="w-4 h-4 animate-pulse" />
                    ) : isRecording ? (
                      <MicOff className="w-4 h-4" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    type="submit"
                    disabled={isLoading || (!input.trim() && attachedFiles.length === 0) || isProcessingVoice}
                    className={`p-2 rounded-xl cursor-pointer transition-colors flex items-center justify-center ${
                      (input.trim() || attachedFiles.length > 0) && !isLoading && !isProcessingVoice
                        ? `${activeTheme.accentBg} text-white hover:${activeTheme.accentBgHover}`
                        : `${activeTheme.tagBg} text-slate-400 cursor-not-allowed`
                    }`}
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Multimedia Camera/Voice modal */}
      <MultimediaModal
        isOpen={showMultimediaModal}
        onClose={() => setShowMultimediaModal(false)}
        activeTheme={activeTheme}
        token={token}
        onProcessResult={handleMultimediaResult}
      />
    </div>
  );
}
