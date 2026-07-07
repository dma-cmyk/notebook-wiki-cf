/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Menu,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sparkles,
  Network,
  FileText,
  Copy,
  Check,
  ShieldCheck,
  Lock,
  UserX,
  ExternalLink,
  HelpCircle,
  Terminal,
  Code,
  Eye,
  EyeOff,
  Settings,
  Loader2,
  Palette,
  Sun,
  Moon,
  X,
  MessageSquare,
  Send,
  Bot,
  Search,
  Download,
  Upload,
} from "lucide-react";
import { User, Memo, GraphNode, GraphLink } from "./types";
import { LoginScreen } from "./components/LoginScreen";
import { Sidebar } from "./components/Sidebar";
import { MemoEditor } from "./components/MemoEditor";
import { KnowledgeGraph } from "./components/KnowledgeGraph";
import { AiSearchChat } from "./components/AiSearchChat";
import { MultimediaModal } from "./components/MultimediaModal";

export interface ThemePreset {
  id: string;
  name: string;
  isDark: boolean;
  bg: string;
  sidebarBg: string;
  cardBg: string;
  textMain: string;
  textMuted: string;
  border: string;
  accentText: string;
  accentBg: string;
  accentBgHover: string;
  accentLight: string;
  accentLightText: string;
  accentBorder: string;
  tagBg: string;
  tagText: string;
  inputBg: string;
  buttonSecondary: string;
  buttonSecondaryHover: string;
  graphNodeColor: string;
  graphLinkColor: string;
}

export const THEMES: ThemePreset[] = [
  // --- LIGHT THEMES ---
  {
    id: "slate-light",
    name: "Slate Indigo (標準)",
    isDark: false,
    bg: "bg-slate-50/70",
    sidebarBg: "bg-white",
    cardBg: "bg-white",
    textMain: "text-slate-900",
    textMuted: "text-slate-500",
    border: "border-slate-200",
    accentText: "text-indigo-600",
    accentBg: "bg-indigo-600",
    accentBgHover: "hover:bg-indigo-700",
    accentLight: "bg-indigo-50/70",
    accentLightText: "text-indigo-700",
    accentBorder: "border-indigo-100/80",
    tagBg: "bg-slate-100",
    tagText: "text-slate-600",
    inputBg: "bg-white",
    buttonSecondary: "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700",
    buttonSecondaryHover: "hover:bg-slate-100",
    graphNodeColor: "#4f46e5", // indigo-600
    graphLinkColor: "#cbd5e1", // slate-300
  },
  {
    id: "amber-light",
    name: "Amber Warm (暖色アンバー)",
    isDark: false,
    bg: "bg-amber-50/40",
    sidebarBg: "bg-[#fffbeb]", // amber-50
    cardBg: "bg-white",
    textMain: "text-amber-950",
    textMuted: "text-amber-700/80",
    border: "border-amber-200/60",
    accentText: "text-amber-700",
    accentBg: "bg-amber-700",
    accentBgHover: "hover:bg-amber-800",
    accentLight: "bg-amber-100/60",
    accentLightText: "text-amber-800",
    accentBorder: "border-amber-200/50",
    tagBg: "bg-amber-50",
    tagText: "text-amber-800",
    inputBg: "bg-white",
    buttonSecondary: "bg-amber-50/50 hover:bg-amber-100/80 border-amber-200/40 text-amber-900",
    buttonSecondaryHover: "hover:bg-amber-100/80",
    graphNodeColor: "#b45309", // amber-700
    graphLinkColor: "#fcd34d", // amber-300
  },
  {
    id: "emerald-light",
    name: "Emerald Mint (ミント)",
    isDark: false,
    bg: "bg-emerald-50/30",
    sidebarBg: "bg-white",
    cardBg: "bg-white",
    textMain: "text-slate-800",
    textMuted: "text-slate-500",
    border: "border-emerald-100",
    accentText: "text-emerald-600",
    accentBg: "bg-emerald-600",
    accentBgHover: "hover:bg-emerald-700",
    accentLight: "bg-emerald-50/70",
    accentLightText: "text-emerald-700",
    accentBorder: "border-emerald-100",
    tagBg: "bg-slate-100",
    tagText: "text-slate-600",
    inputBg: "bg-white",
    buttonSecondary: "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700",
    buttonSecondaryHover: "hover:bg-slate-100",
    graphNodeColor: "#059669", // emerald-600
    graphLinkColor: "#a7f3d0", // emerald-200
  },
  {
    id: "rose-light",
    name: "Sakura Rose (ローズ)",
    isDark: false,
    bg: "bg-rose-50/30",
    sidebarBg: "bg-white",
    cardBg: "bg-white",
    textMain: "text-slate-800",
    textMuted: "text-slate-500",
    border: "border-rose-100",
    accentText: "text-rose-600",
    accentBg: "bg-rose-600",
    accentBgHover: "hover:bg-rose-700",
    accentLight: "bg-rose-50/70",
    accentLightText: "text-rose-700",
    accentBorder: "border-rose-100",
    tagBg: "bg-slate-100",
    tagText: "text-slate-600",
    inputBg: "bg-white",
    buttonSecondary: "bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700",
    buttonSecondaryHover: "hover:bg-slate-100",
    graphNodeColor: "#db2777", // rose-600
    graphLinkColor: "#fecdd3", // rose-200
  },

  // --- DARK THEMES ---
  {
    id: "graphite-dark",
    name: "Slate Dark (ダーク)",
    isDark: true,
    bg: "bg-slate-950",
    sidebarBg: "bg-slate-900",
    cardBg: "bg-slate-900/60",
    textMain: "text-slate-100",
    textMuted: "text-slate-400",
    border: "border-slate-800/80",
    accentText: "text-indigo-400",
    accentBg: "bg-indigo-600",
    accentBgHover: "hover:bg-indigo-700",
    accentLight: "bg-indigo-500/15",
    accentLightText: "text-indigo-300",
    accentBorder: "border-indigo-500/20",
    tagBg: "bg-slate-800",
    tagText: "text-slate-300",
    inputBg: "bg-slate-900/50",
    buttonSecondary: "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200",
    buttonSecondaryHover: "hover:bg-slate-700",
    graphNodeColor: "#818cf8", // indigo-400
    graphLinkColor: "#334155", // slate-700
  },
  {
    id: "obsidian-dark",
    name: "Obsidian Mint (深緑ダーク)",
    isDark: true,
    bg: "bg-zinc-950",
    sidebarBg: "bg-black",
    cardBg: "bg-zinc-900/80",
    textMain: "text-zinc-100",
    textMuted: "text-zinc-400",
    border: "border-zinc-800",
    accentText: "text-emerald-400",
    accentBg: "bg-emerald-600",
    accentBgHover: "hover:bg-emerald-700",
    accentLight: "bg-emerald-500/15",
    accentLightText: "text-emerald-300",
    accentBorder: "border-emerald-500/20",
    tagBg: "bg-zinc-800",
    tagText: "text-zinc-300",
    inputBg: "bg-zinc-900/50",
    buttonSecondary: "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-200",
    buttonSecondaryHover: "hover:bg-zinc-700",
    graphNodeColor: "#34d399", // emerald-400
    graphLinkColor: "#27272a", // zinc-800
  },
  {
    id: "nord-dark",
    name: "Nord Dark (北欧ブルー)",
    isDark: true,
    bg: "bg-[#0f172a]", // slate-900
    sidebarBg: "bg-[#1e293b]", // slate-800
    cardBg: "bg-[#1e293b]/60",
    textMain: "text-slate-100",
    textMuted: "text-slate-400",
    border: "border-slate-800",
    accentText: "text-sky-400",
    accentBg: "bg-sky-600",
    accentBgHover: "hover:bg-sky-700",
    accentLight: "bg-sky-500/15",
    accentLightText: "text-sky-300",
    accentBorder: "border-sky-500/20",
    tagBg: "bg-slate-800",
    tagText: "text-slate-300",
    inputBg: "bg-slate-900/50",
    buttonSecondary: "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200",
    buttonSecondaryHover: "hover:bg-slate-700",
    graphNodeColor: "#38bdf8", // sky-400
    graphLinkColor: "#334155", // slate-700
  },
  {
    id: "sunset-dark",
    name: "Twilight Violet (黄昏パープル)",
    isDark: true,
    bg: "bg-[#0b0714]",
    sidebarBg: "bg-[#130b21]",
    cardBg: "bg-[#1d1233]/70",
    textMain: "text-violet-100",
    textMuted: "text-violet-300/60",
    border: "border-violet-900/40",
    accentText: "text-fuchsia-400",
    accentBg: "bg-violet-700",
    accentBgHover: "hover:bg-violet-800",
    accentLight: "bg-violet-500/15",
    accentLightText: "text-violet-300",
    accentBorder: "border-violet-500/20",
    tagBg: "bg-[#1b1030]",
    tagText: "text-violet-200",
    inputBg: "bg-[#08050e]",
    buttonSecondary: "bg-[#251a3d] hover:bg-[#2d204a] border-violet-900/30 text-[#e9d5ff]",
    buttonSecondaryHover: "hover:bg-[#2d204a]",
    graphNodeColor: "#e879f9", // fuchsia-400
    graphLinkColor: "#2e1065", // violet-950
  }
];

const DEFAULT_GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

const DEFAULT_OPENAI_MODELS = [
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "claude-3-5-sonnet-latest",
  "claude-3-5-haiku-latest",
  "deepseek-chat",
  "deepseek-coder",
  "llama3.1",
  "llama3.2",
  "mistral",
  "qwen2.5",
  "phi3",
];

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [selectedMemoId, setSelectedMemoId] = useState<string | null>(null);

  // Layout states
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 768 : true);
  const [activeTab, setActiveTab] = useState<"memo" | "graph">("memo");
  const [isLoadingMemos, setIsLoadingMemos] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showApiHelpModal, setShowApiHelpModal] = useState(false);
  const [isRotatingKey, setIsRotatingKey] = useState(false);
  const [rotationError, setRotationError] = useState<string | null>(null);
  const [helpCodeTab, setHelpCodeTab] = useState<"curl" | "python" | "js" | "agent">("curl");
  const [copiedCode, setCopiedCode] = useState(false);

  // API key visibility toggle in Help Modal
  const [showApiKeyInHelp, setShowApiKeyInHelp] = useState(false);
  const [showUsername, setShowUsername] = useState(false);

  // AI Configuration Settings States
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsProvider, setSettingsProvider] = useState<"gemini" | "openai-compatible">("gemini");
  const [settingsApiKey, setSettingsApiKey] = useState("");
  const [settingsEndpoint, setSettingsEndpoint] = useState("https://api.openai.com/v1");
  const [settingsModel, setSettingsModel] = useState("gemini-3.5-flash");
  const [availableModels, setAvailableModels] = useState<string[]>(DEFAULT_GEMINI_MODELS);
  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [showSettingsKey, setShowSettingsKey] = useState(false);
  const [showMultimediaModal, setShowMultimediaModal] = useState(false);
  const [showChatPopup, setShowChatPopup] = useState(false);

  // Data Migration States
  const [exportPassword, setExportPassword] = useState("");
  const [showExportPassword, setShowExportPassword] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  const [importPassword, setImportPassword] = useState("");
  const [showImportPassword, setShowImportPassword] = useState(false);
  const [importMode, setImportMode] = useState<"merge" | "overwrite">("merge");
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Batch Regeneration States
  const [isBatchRegenerating, setIsBatchRegenerating] = useState(false);
  const [batchRegenerateError, setBatchRegenerateError] = useState<string | null>(null);
  const [batchRegenerateSuccess, setBatchRegenerateSuccess] = useState<string | null>(null);

  // Password Change States
  const [currentPassphrase, setCurrentPassphrase] = useState("");
  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirmNewPassphrase, setConfirmNewPassphrase] = useState("");
  const [passwordChangeTotp, setPasswordChangeTotp] = useState("");
  const [showCurrentPassphrase, setShowCurrentPassphrase] = useState(false);
  const [showNewPassphrase, setShowNewPassphrase] = useState(false);
  const [showConfirmNewPassphrase, setShowConfirmNewPassphrase] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordChangeError, setPasswordChangeError] = useState<string | null>(null);
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState<string | null>(null);

  // Account Deletion States
  const [deletePassphrase, setDeletePassphrase] = useState("");
  const [deleteAccountTotp, setDeleteAccountTotp] = useState("");
  const [showDeletePassphrase, setShowDeletePassphrase] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [confirmDeleteCheckbox, setConfirmDeleteCheckbox] = useState(false);

  // Shared search query state
  const [searchQuery, setSearchQuery] = useState("");

  // Google Drive Integration States
  const [googleTokenData, setGoogleTokenData] = useState<any>(null);
  const [showDriveImportModal, setShowDriveImportModal] = useState(false);

  useEffect(() => {
    const handleGoogleMessage = (event: MessageEvent) => {
      // Allow messages from any run.app domain or localhost during development
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost") && !origin.includes("127.0.0.1")) {
        return;
      }
      if (event.data?.type === "GOOGLE_OAUTH_SUCCESS") {
        setGoogleTokenData(event.data.tokenData);
      }
    };
    window.addEventListener("message", handleGoogleMessage);
    return () => window.removeEventListener("message", handleGoogleMessage);
  }, []);

  const handleConnectGoogleDrive = async () => {
    try {
      const res = await fetch("/api/auth/google/url");
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Google認証URLの取得に失敗しました。");
      }
      const { url } = await res.json();
      
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const popup = window.open(
        url,
        "google_oauth_popup",
        `width=${width},height=${height},top=${top},left=${left}`
      );
      
      if (!popup) {
        alert("ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。");
      }
    } catch (err: any) {
      console.error(err);
      alert("Google Drive連携の初期化に失敗しました: " + err.message);
    }
  };

  const handleSaveMemoToDrive = async (
    memoId: string,
    title: string,
    content: string,
    filename: string,
    existingFileId?: string
  ) => {
    if (!token || !googleTokenData) {
      throw new Error("連携されていないか、セッションが無効です。");
    }

    try {
      const res = await fetch("/api/google/drive/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          googleAccessToken: googleTokenData.access_token,
          filename,
          content,
          fileId: existingFileId,
        }),
      });

      const driveData = await res.json();
      if (!res.ok) {
        throw new Error(driveData.error || "Google Driveへの保存に失敗しました。");
      }

      // Sync with local encrypted memo store as well, adding linked IDs
      await handleSaveMemo(memoId, title, content, driveData.fileId, driveData.name);
      return { success: true, name: driveData.name, fileId: driveData.fileId };
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  };

  // Theme states
  const [currentThemeId, setCurrentThemeId] = useState<string>("slate-light");
  const activeTheme = THEMES.find((t) => t.id === currentThemeId) || THEMES[0];

  const handleThemeChange = async (themeId: string) => {
    setCurrentThemeId(themeId);
    
    // 1. Immediately persist in localStorage for instant loading on next session
    if (currentUser) {
      const updatedUser = { ...currentUser, theme: themeId };
      setCurrentUser(updatedUser);
      localStorage.setItem("llm_wiki_user", JSON.stringify(updatedUser));
    }
    
    // 2. Immediately save to the backend database
    if (token) {
      try {
        await fetch("/api/settings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            aiProvider: settingsProvider,
            aiApiKey: settingsApiKey,
            aiEndpoint: settingsEndpoint,
            aiModel: settingsModel,
            theme: themeId,
          }),
        });
      } catch (err) {
        console.error("Failed to auto-save theme setting to server:", err);
      }
    }
  };

  // Restore session from localStorage if present
  useEffect(() => {
    const savedToken = localStorage.getItem("llm_wiki_token");
    const savedUser = localStorage.getItem("llm_wiki_user");
    if (savedToken && savedUser) {
      setToken(savedToken);
      const parsedUser = JSON.parse(savedUser);
      setCurrentUser(parsedUser);
      if (parsedUser.theme) {
        setCurrentThemeId(parsedUser.theme);
      }
    }
  }, []);

  const fetchSettings = async (authToken?: string) => {
    const t = authToken || token;
    if (!t) return;
    try {
      const res = await fetch("/api/settings", {
        headers: {
          Authorization: `Bearer ${t}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        const provider = data.aiProvider || "gemini";
        setSettingsProvider(provider);
        setSettingsApiKey(data.aiApiKey || "");
        setSettingsEndpoint(data.aiEndpoint || "https://api.openai.com/v1");
        if (data.theme) {
          setCurrentThemeId(data.theme);
        }
        
        const currentModel = data.aiModel || (provider === "gemini" ? "gemini-3.5-flash" : "gpt-4o-mini");
        setSettingsModel(currentModel);

        const defaultList = provider === "gemini" ? DEFAULT_GEMINI_MODELS : DEFAULT_OPENAI_MODELS;
        const uniqList = Array.from(new Set([currentModel, ...defaultList]));
        setAvailableModels(uniqList);
      }
    } catch (err) {
      console.error("Failed to fetch AI settings:", err);
    }
  };

  const handleFetchModels = async () => {
    if (!token) return;
    setIsFetchingModels(true);
    setSettingsError(null);
    try {
      const res = await fetch("/api/settings/fetch-models", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          aiProvider: settingsProvider,
          aiApiKey: settingsApiKey,
          aiEndpoint: settingsEndpoint,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAvailableModels(data.models || []);
        if (data.models && data.models.length > 0) {
          if (!data.models.includes(settingsModel)) {
            setSettingsModel(data.models[0]);
          }
        }
      } else {
        setSettingsError(data.error || "モデルの取得に失敗しました。");
      }
    } catch (err: any) {
      setSettingsError(err.message || "通信エラーが発生しました。");
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!token) return;
    setIsSavingSettings(true);
    setSettingsError(null);
    setSettingsSuccess(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          aiProvider: settingsProvider,
          aiApiKey: settingsApiKey,
          aiEndpoint: settingsEndpoint,
          aiModel: settingsModel,
          theme: currentThemeId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSettingsSuccess(true);
        if (currentUser) {
          const updatedUser = {
            ...currentUser,
            aiProvider: settingsProvider,
            aiApiKey: settingsApiKey,
            aiEndpoint: settingsEndpoint,
            aiModel: settingsModel,
            theme: currentThemeId,
          };
          setCurrentUser(updatedUser);
          localStorage.setItem("llm_wiki_user", JSON.stringify(updatedUser));
        }
        setTimeout(() => {
          setSettingsSuccess(false);
          setShowSettingsModal(false);
        }, 1500);
      } else {
        setSettingsError(data.error || "設定の保存に失敗しました。");
      }
    } catch (err: any) {
      setSettingsError(err.message || "通信エラーが発生しました。");
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!currentPassphrase || !newPassphrase || !passwordChangeTotp) {
      setPasswordChangeError("現在のパスワード、新しいパスワード、およびTOTPコードを入力してください。");
      return;
    }
    if (newPassphrase !== confirmNewPassphrase) {
      setPasswordChangeError("新しいパスワードと確認用パスワードが一致しません。");
      return;
    }
    if (newPassphrase.length < 4) {
      setPasswordChangeError("パスワードは4文字以上で入力してください。");
      return;
    }

    setIsChangingPassword(true);
    setPasswordChangeError(null);
    setPasswordChangeSuccess(null);

    try {
      const res = await fetch("/api/settings/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassphrase,
          newPassphrase,
          totpCode: passwordChangeTotp,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setPasswordChangeSuccess("パスワードが正常に変更されました！");
        setCurrentPassphrase("");
        setNewPassphrase("");
        setConfirmNewPassphrase("");
        setPasswordChangeTotp("");
      } else {
        setPasswordChangeError(data.error || "パスワードの変更に失敗しました。現在のパスワードが異なる可能性があります。");
      }
    } catch (err: any) {
      setPasswordChangeError(err.message || "通信エラーが発生しました。");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!deletePassphrase) {
      setDeleteAccountError("パスワードを入力してください。");
      return;
    }
    if (!deleteAccountTotp) {
      setDeleteAccountError("TOTP認証コードを入力してください。");
      return;
    }
    if (!confirmDeleteCheckbox) {
      setDeleteAccountError("データ削除の同意チェックボックスを選択してください。");
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountError(null);

    try {
      const res = await fetch("/api/settings/delete-account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          passphrase: deletePassphrase,
          totpCode: deleteAccountTotp,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        localStorage.removeItem("llm_wiki_token");
        localStorage.removeItem("llm_wiki_user");
        setToken(null);
        setCurrentUser(null);
        setMemos([]);
        setShowSettingsModal(false);
        setDeletePassphrase("");
        setDeleteAccountTotp("");
        setConfirmDeleteCheckbox(false);
      } else {
        setDeleteAccountError(data.error || "アカウントの削除に失敗しました。現在のパスワードまたはTOTP認証コードが異なる可能性があります。");
      }
    } catch (err: any) {
      setDeleteAccountError(err.message || "通信エラーが発生しました。");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const handleExportData = async () => {
    if (!token) return;
    if (!exportPassword) {
      setExportError("暗号化用パスワードを入力してください。");
      return;
    }
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(false);

    try {
      const res = await fetch("/api/memos/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: exportPassword }),
      });

      const data = await res.json();
      if (res.ok) {
        // Download the JSON file
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `llm_wiki_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setExportSuccess(true);
        setExportPassword(""); // Clear password for security
      } else {
        setExportError(data.error || "エクスポートに失敗しました。");
      }
    } catch (err: any) {
      setExportError(err.message || "通信エラーが発生しました。");
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportData = async () => {
    if (!token) return;
    if (!selectedImportFile) {
      setImportError("インポートするファイルを選択してください。");
      return;
    }
    if (!importPassword) {
      setImportError("復号用パスワードを入力してください。");
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const fileReader = new FileReader();
      fileReader.onload = async (e) => {
        try {
          const fileContent = e.target?.result as string;
          const parsedPayload = JSON.parse(fileContent);

          if (!parsedPayload.salt || !parsedPayload.encryptedData) {
            setImportError("無効なバックアップファイル形式です。");
            setIsImporting(false);
            return;
          }

          const res = await fetch("/api/memos/import", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              password: importPassword,
              salt: parsedPayload.salt,
              encryptedData: parsedPayload.encryptedData,
              mode: importMode,
            }),
          });

          const data = await res.json();
          if (res.ok) {
            setImportSuccess(`${data.count} 件のメモをインポートしました。`);
            setImportPassword("");
            setSelectedImportFile(null);
            fetchMemos(token); // Refresh memos list
          } else {
            setImportError(data.error || "インポートに失敗しました。パスワードが異なる可能性があります。");
          }
        } catch (err: any) {
          setImportError("バックアップファイルの解析に失敗しました。");
        } finally {
          setIsImporting(false);
        }
      };

      fileReader.onerror = () => {
        setImportError("ファイルの読み込み中にエラーが発生しました。");
        setIsImporting(false);
      };

      fileReader.readAsText(selectedImportFile);
    } catch (err: any) {
      setImportError(err.message || "予期しないエラーが発生しました。");
      setIsImporting(false);
    }
  };

  const handleBatchRegenerateMetadata = async () => {
    if (!token) return;
    if (!window.confirm("すべてのメモの要約・タグ・関連付けを一括再生成します。よろしいですか？\n※ メモ数が多い場合、完了まで時間がかかることがあります。")) {
      return;
    }

    setIsBatchRegenerating(true);
    setBatchRegenerateError(null);
    setBatchRegenerateSuccess(null);

    try {
      const res = await fetch("/api/memos/batch-regenerate-metadata", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setBatchRegenerateSuccess(`${data.count} 件のメモの要約・タグ・関連付けを再構成しました。`);
        fetchMemos(token); // Refresh the list so graph & memos update
      } else {
        setBatchRegenerateError(data.error || "一括再生成に失敗しました。");
      }
    } catch (err: any) {
      setBatchRegenerateError(err.message || "通信エラーが発生しました。");
    } finally {
      setIsBatchRegenerating(false);
    }
  };

  // Fetch Memos once authenticated
  const fetchMemos = async (authToken: string) => {
    setIsLoadingMemos(true);
    try {
      const res = await fetch("/api/memos", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setMemos(data);
      } else if (res.status === 401) {
        // Session expired
        handleLogout();
      }
    } catch (err) {
      console.error("Failed to fetch memos:", err);
    } finally {
      setIsLoadingMemos(false);
    }
  };

  const handleRefreshMemosAndSelect = async (selectId?: string) => {
    if (token) {
      await fetchMemos(token);
      if (selectId) {
        setSelectedMemoId(selectId);
        setActiveTab("memo");
      }
    }
  };

  useEffect(() => {
    if (token) {
      fetchMemos(token);
      fetchSettings(token);
    }
  }, [token]);

  const handleLoginSuccess = (newToken: string, user: User) => {
    localStorage.setItem("llm_wiki_token", newToken);
    localStorage.setItem("llm_wiki_user", JSON.stringify(user));
    setToken(newToken);
    setCurrentUser(user);
    if (user.theme) {
      setCurrentThemeId(user.theme);
    }
    fetchMemos(newToken);
    fetchSettings(newToken);
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (err) {
        console.error("Logout request failed:", err);
      }
    }
    localStorage.removeItem("llm_wiki_token");
    localStorage.removeItem("llm_wiki_user");
    setToken(null);
    setCurrentUser(null);
    setMemos([]);
    setSelectedMemoId(null);
    setActiveTab("memo");
  };

  const handleCreateMemo = async (customTitle?: string, customContent?: string) => {
    if (!token) return;
    setIsLoadingMemos(true);
    setSearchQuery(""); // Clear search so the newly created memo is visible in the list
    try {
      // Robust checks to make sure we don't treat MouseEvent as a title
      const actualTitle = (typeof customTitle === "string" && customTitle.trim()) ? customTitle : "新規メモ";
      const actualContent = (typeof customContent === "string" && customContent.trim()) 
        ? customContent 
        : `# ${actualTitle}\n\nここにコンテンツを記述してください。`;

      const res = await fetch("/api/memos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: actualTitle,
          content: actualContent,
        }),
      });

      if (res.ok) {
        const newMemo = await res.json();
        setMemos((prev) => [newMemo, ...prev]);
        setSelectedMemoId(newMemo.id);
        setActiveTab("memo");
      }
    } catch (err) {
      console.error("Failed to create memo:", err);
    } finally {
      setIsLoadingMemos(false);
    }
  };

  const handleSaveMemo = async (id: string, title: string, content: string, googleFileId?: string, googleFileName?: string) => {
    if (!token) return;
    try {
      const res = await fetch("/api/memos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id, title, content, googleFileId, googleFileName }),
      });

      if (res.ok) {
        const updatedMemo = await res.json();
        setMemos((prev) => prev.map((m) => (m.id === id ? updatedMemo : m)));
        return updatedMemo;
      }
    } catch (err) {
      console.error("Failed to save memo:", err);
    }
  };

  const handleDeleteMemo = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/memos/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        setMemos((prev) => prev.filter((m) => m.id !== id));
        if (selectedMemoId === id) {
          setSelectedMemoId(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete memo:", err);
    }
  };

  const handleRegenerateMetadata = async (id: string) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/memos/${id}/regenerate-metadata`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const updatedMemo = await res.json();
        setMemos((prev) => prev.map((m) => (m.id === id ? updatedMemo : m)));
      }
    } catch (err) {
      console.error("Failed to regenerate metadata:", err);
    }
  };

  const copyApiKey = () => {
    if (!currentUser) return;
    navigator.clipboard.writeText(currentUser.apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const rotateApiKey = async () => {
    if (!token || !currentUser) return;
    if (!window.confirm("APIキーを再生成してもよろしいですか？\n古いAPIキーを使用した外部からのアクセスは即座に無効化されます。")) {
      return;
    }

    setIsRotatingKey(true);
    setRotationError(null);
    try {
      const res = await fetch("/api/auth/rotate-api-key", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "APIキーのローテーションに失敗しました。");
      }

      const data = await res.json();
      if (data.success && data.apiKey) {
        // Update state
        const updatedUser = { ...currentUser, apiKey: data.apiKey };
        setCurrentUser(updatedUser);
        // Save to sessionStorage
        const storedUserJson = sessionStorage.getItem("user");
        if (storedUserJson) {
          const storedUser = JSON.parse(storedUserJson);
          sessionStorage.setItem("user", JSON.stringify({ ...storedUser, apiKey: data.apiKey }));
        }
        alert("APIキーを正常に再生成しました。");
      }
    } catch (err: any) {
      console.error("Failed to rotate API Key:", err);
      setRotationError(err.message || String(err));
    } finally {
      setIsRotatingKey(false);
    }
  };

  const copySampleCode = (codeText: string) => {
    navigator.clipboard.writeText(codeText);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  // Compile Graph Data for the visual graph (including tag nodes)
  const memoNodes: GraphNode[] = memos.map((m) => ({
    id: m.id,
    title: m.title || "無題のメモ",
    tags: m.tags || [],
    type: "memo" as const,
  }));

  // Collect all unique tags and create tag nodes
  const tagMap = new Map<string, string>(); // lowercaseKey -> cleanedDisplayWithOriginalCase
  memos.forEach((m) => {
    if (m.tags) {
      m.tags.forEach((tag) => {
        if (tag && tag.trim()) {
          const cleanedDisplay = tag.trim().replace(/^#+/, "").trim();
          const lowercaseKey = cleanedDisplay.toLowerCase();
          if (lowercaseKey) {
            if (!tagMap.has(lowercaseKey)) {
              tagMap.set(lowercaseKey, cleanedDisplay);
            }
          }
        }
      });
    }
  });

  const tagNodes: GraphNode[] = Array.from(tagMap.values()).map((displayTag) => ({
    id: `tag:${displayTag}`,
    title: `#${displayTag}`,
    tags: [],
    type: "tag" as const,
  }));

  const graphNodes: GraphNode[] = [...memoNodes, ...tagNodes];

  const graphLinks: GraphLink[] = [];
  const memoIdSet = new Set(memos.map((m) => m.id));

  memos.forEach((m) => {
    // Memo-to-memo links
    if (m.relatedMemoIds) {
      m.relatedMemoIds.forEach((targetId) => {
        if (memoIdSet.has(targetId)) {
          graphLinks.push({
            source: m.id,
            target: targetId,
          });
        }
      });
    }

    // Memo-to-tag links
    if (m.tags) {
      const addedTagsForThisMemo = new Set<string>();
      m.tags.forEach((tag) => {
        if (tag && tag.trim()) {
          const cleanedDisplay = tag.trim().replace(/^#+/, "").trim();
          const lowercaseKey = cleanedDisplay.toLowerCase();
          const matchedDisplay = tagMap.get(lowercaseKey);
          if (matchedDisplay && !addedTagsForThisMemo.has(matchedDisplay)) {
            addedTagsForThisMemo.add(matchedDisplay);
            graphLinks.push({
              source: m.id,
              target: `tag:${matchedDisplay}`,
            });
          }
        }
      });
    }
  });

  const activeMemo = memos.find((m) => m.id === selectedMemoId) || null;

  if (!token || !currentUser) {
    return <LoginScreen onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className={`h-screen w-screen flex flex-col font-sans overflow-hidden transition-colors duration-300 ${activeTheme.bg} ${activeTheme.textMain}`}>
      {/* Dynamic Header */}
      <header className={`h-14 border-b flex items-center justify-between px-2 sm:px-4 md:px-6 shrink-0 select-none shadow-sm z-20 transition-all duration-300 ${activeTheme.border} ${activeTheme.sidebarBg}`}>
        <div className="flex items-center gap-1.5 md:gap-4">
          {/* Toggle Sidebar Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${activeTheme.textMuted} hover:${activeTheme.textMain} hover:${activeTheme.tagBg}`}
            title="サイドバーの開閉"
          >
            {sidebarOpen ? <ChevronLeft className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="hidden sm:flex items-center gap-2 md:gap-3">
            <div className={`w-8 h-8 rounded flex items-center justify-center text-white font-bold shadow-sm ${activeTheme.accentBg}`}>
              <span className="text-xs">LW</span>
            </div>
            <div>
              <span className={`font-display font-semibold text-base tracking-tight ${activeTheme.textMain}`}>LLM Wiki</span>
              <span className={`text-[10px] font-mono ml-2 border rounded px-1.5 py-0.5 ${activeTheme.accentText} ${activeTheme.accentBorder} ${activeTheme.accentLight}`}>
                TOTP Secure
              </span>
            </div>
          </div>
        </div>

        {/* Workspace Tab Switcher (Memo editor vs Graph visualizer vs AI search chat) */}
        <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
          <div className={`p-1 rounded-lg border flex items-center shrink-0 ${activeTheme.tagBg} ${activeTheme.border}`}>
            <button
              onClick={() => setActiveTab("memo")}
              className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all whitespace-nowrap shrink-0 ${
                activeTab === "memo"
                  ? `${activeTheme.cardBg} ${activeTheme.textMain} shadow-sm`
                  : `${activeTheme.textMuted} hover:${activeTheme.textMain}`
              }`}
              title="メモ本文"
            >
              <FileText className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden md:inline">メモ本文</span>
              <span className="hidden sm:inline md:hidden">メモ</span>
            </button>
            <button
              onClick={() => setActiveTab("graph")}
              className={`flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all whitespace-nowrap shrink-0 ${
                activeTab === "graph"
                  ? `${activeTheme.cardBg} ${activeTheme.textMain} shadow-sm`
                  : `${activeTheme.textMuted} hover:${activeTheme.textMain}`
              }`}
              title="ナレッジグラフ"
            >
              <Network className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              <span className="hidden md:inline">ナレッジグラフ</span>
              <span className="hidden sm:inline md:hidden">グラフ</span>
            </button>
          </div>
        </div>

        {/* User Workspace Status & Logout */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Encrypted Workspace Indicator */}
          <div className="hidden xl:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 pl-3 pr-2 py-1 rounded-full text-xs font-medium font-sans">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse mr-1"></div>
            <span className="font-mono select-none">
              Auth: {showUsername ? currentUser.username : "••••••••"}
            </span>
            <button
              onClick={() => setShowUsername(!showUsername)}
              className="ml-1 p-0.5 rounded-full hover:bg-emerald-500/20 text-emerald-700 transition-colors cursor-pointer"
              title={showUsername ? "ユーザー名を非表示にする (プライバシー保護)" : "ユーザー名を表示する"}
            >
              {showUsername ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Settings Trigger Button */}
          <button
            onClick={() => {
              fetchSettings();
              setShowSettingsModal(true);
            }}
            className={`flex items-center gap-1.5 border p-1.5 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain} hover:${activeTheme.tagBg}`}
            title="設定・テーマ・データ移行を開きます"
          >
            <Settings className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-slate-500" />
            <span className="hidden md:inline">設定</span>
          </button>

          {/* Logout Trigger */}
          <button
            onClick={handleLogout}
            title="復号セッションを破棄してログアウト"
            className={`p-1.5 sm:p-2 rounded-lg border transition-colors cursor-pointer ${activeTheme.border} ${activeTheme.textMuted} hover:border-red-400 hover:text-red-500 hover:bg-red-500/10`}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Core View Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Sidebar backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] z-20 md:hidden animate-in fade-in duration-200"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        {/* Sidebar */}
        <Sidebar
          memos={memos}
          selectedMemoId={selectedMemoId}
          onSelectMemo={setSelectedMemoId}
          onCreateMemo={handleCreateMemo}
          isOpen={sidebarOpen}
          setIsOpen={setSidebarOpen}
          activeTheme={activeTheme}
          search={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* View Switcher Container */}
        <main className={`flex-1 h-full overflow-hidden flex flex-col relative ${activeTheme.bg}`}>
          {activeTab === "memo" ? (
            <MemoEditor
              memo={activeMemo}
              allMemos={memos}
              onSave={handleSaveMemo}
              onDelete={handleDeleteMemo}
              onRegenerateMetadata={handleRegenerateMetadata}
              onSelectMemo={setSelectedMemoId}
              activeTheme={activeTheme}
              token={token}
              onRefreshMemosAndSelect={handleRefreshMemosAndSelect}
            />
          ) : (
            <div className={`flex-1 h-full p-4 sm:p-6 md:p-8 flex flex-col min-h-0 ${activeTheme.bg}`}>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 md:mb-5 shrink-0 select-none">
                <div>
                  <h2 className={`text-base md:text-lg font-display font-semibold flex items-center gap-1.5 ${activeTheme.textMain}`}>
                    <Network className={`w-5 h-5 ${activeTheme.accentText}`} />
                    <span>ナレッジグラフ（メモ同士の接続）</span>
                  </h2>
                  <p className={`text-[11px] md:text-xs mt-0.5 hidden sm:block ${activeTheme.textMuted}`}>
                    各メモの関連性をAIが分析して繋ぎ合わせています。ノードをクリックすると直接そのメモを開けます。
                  </p>
                </div>
                {memos.length > 0 && (
                  <div className={`text-xs font-mono px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-sm border self-start md:self-auto ${activeTheme.tagBg} ${activeTheme.border} ${activeTheme.textMuted}`}>
                    <span>メモ: <b>{memos.length}</b></span>
                    <span className="opacity-30">|</span>
                    <span>接続数: <b>{graphLinks.length}</b></span>
                  </div>
                )}
              </div>

              {/* Force Directed Interactive Node Network Canvas */}
              <div className="flex-1 min-h-0">
                <KnowledgeGraph
                  nodes={graphNodes}
                  links={graphLinks}
                  selectedNodeId={selectedMemoId || undefined}
                  onNodeSelect={(nodeId) => {
                    if (!nodeId) {
                      setSelectedMemoId(null);
                    } else if (nodeId.startsWith("tag:")) {
                      const tagName = nodeId.substring(4);
                      setSearchQuery(`#${tagName} `);
                      setSidebarOpen(true);
                      setActiveTab("memo");
                    } else {
                      setSelectedMemoId(nodeId);
                      setActiveTab("memo");
                    }
                  }}
                  activeTheme={activeTheme}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      {/* API Help Modal */}
      {showApiHelpModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150 text-slate-800">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-indigo-600" />
                <h3 className="font-display font-bold text-slate-950 text-base">外部連携API 使い方ヘルプ</h3>
              </div>
              <button
                onClick={() => setShowApiHelpModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl p-1.5 cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <p className="text-sm leading-relaxed text-slate-600">
                  他のツール、外部スクリプト（PythonやNode.js等）、または自動化ツール（Zapier等）から本システムに直接メモを自動登録することができます。
                  保存する際にAIが自動的に関連性をタグ付け・リンクの作成をして、ナレッジグラフへ統合します。
                </p>
              </div>

              {/* Endpoint Specs */}
              <div className="bg-slate-50 rounded-xl border border-slate-200/60 p-4 space-y-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">API 仕様</h4>
                
                <div className="space-y-3.5">
                  {/* Row 1: Method & URL */}
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">HTTP メソッド & URL</span>
                    <div className="flex items-center gap-2 mt-1.5 bg-white border border-slate-200/80 rounded-lg p-1.5 pl-2.5">
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-1 rounded shrink-0">POST</span>
                      <div className="font-mono text-xs text-slate-800 font-semibold overflow-x-auto whitespace-nowrap flex-1 py-1 scrollbar-thin">
                        {window.location.origin}/api/external/memos
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/api/external/memos`);
                          setCopiedUrl(true);
                          setTimeout(() => setCopiedUrl(false), 2000);
                        }}
                        className="text-indigo-600 hover:text-indigo-700 hover:bg-slate-50 text-[11px] font-bold cursor-pointer shrink-0 border border-slate-100 rounded px-2 py-1 transition-all"
                      >
                        {copiedUrl ? "コピー済" : "コピー"}
                      </button>
                    </div>
                  </div>

                  {/* Row 2: API Key */}
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wide">API キー (x-api-key)</span>
                    <div className="flex items-center gap-2 mt-1.5 bg-white border border-slate-200/80 rounded-lg p-1.5 pl-2.5">
                      <div className="font-mono text-xs text-slate-800 font-semibold overflow-x-auto whitespace-nowrap flex-1 py-1 scrollbar-thin">
                        {showApiKeyInHelp ? currentUser.apiKey : "••••••••••••••••••••••••••••••••"}
                      </div>
                      <button
                        onClick={() => setShowApiKeyInHelp(!showApiKeyInHelp)}
                        className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-50 transition-all cursor-pointer shrink-0"
                        title={showApiKeyInHelp ? "キーを非表示にする" : "キーを表示する"}
                      >
                        {showApiKeyInHelp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(currentUser.apiKey);
                          setCopiedKey(true);
                          setTimeout(() => setCopiedKey(false), 2000);
                        }}
                        className="text-indigo-600 hover:text-indigo-700 hover:bg-slate-50 text-[11px] font-bold cursor-pointer shrink-0 border border-slate-100 rounded px-2 py-1 transition-all"
                      >
                        {copiedKey ? "コピー済" : "コピー"}
                      </button>
                    </div>

                    {/* Key rotation and error status */}
                    <div className="mt-2.5 flex items-center justify-between gap-4">
                      {rotationError ? (
                        <p className="text-[10px] text-red-600 font-semibold">{rotationError}</p>
                      ) : (
                        <p className="text-[10px] text-slate-400 leading-normal max-w-xs sm:max-w-md">
                          ※ キーを紛失したり漏洩した場合は、再生成して新しいキーを再設定してください。古いキーは即座に無効化されます。
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={rotateApiKey}
                        disabled={isRotatingKey}
                        className="text-[11px] text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 font-bold cursor-pointer shrink-0 border border-indigo-200 rounded px-2.5 py-1.5 transition-all flex items-center gap-1.5 bg-white shadow-sm disabled:opacity-50"
                      >
                        {isRotatingKey ? "再生成中..." : "APIキーを再生成"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Code className="w-3.5 h-3.5 text-indigo-500" />
                      <span>実装コードサンプル</span>
                    </h4>
                    {/* Tabs */}
                    <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-semibold flex-wrap gap-0.5">
                      <button
                        onClick={() => setHelpCodeTab("curl")}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                          helpCodeTab === "curl" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        cURL
                      </button>
                      <button
                        onClick={() => setHelpCodeTab("python")}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                          helpCodeTab === "python" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Python
                      </button>
                      <button
                        onClick={() => setHelpCodeTab("js")}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                          helpCodeTab === "js" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        JavaScript
                      </button>
                      <button
                        onClick={() => setHelpCodeTab("agent")}
                        className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                          helpCodeTab === "agent" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        AIエージェント
                      </button>
                    </div>
                  </div>

                  {/* Code Content Box */}
                  <div className="bg-slate-950 rounded-xl p-4 overflow-x-auto border border-slate-800 shadow-inner relative group">
                    <button
                      onClick={() => {
                        let codeText = "";
                        if (helpCodeTab === "curl") {
                          codeText = `curl -X POST "${window.location.origin}/api/external/memos" \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-key: ${currentUser.apiKey}" \\\n  -d '{\n    "title": "APIからのテストメモ",\n    "content": "このメモは外部API経由で送信されました。"\n  }'`;
                        } else if (helpCodeTab === "python") {
                          codeText = `import requests\n\nurl = "${window.location.origin}/api/external/memos"\nheaders = {\n    "Content-Type": "application/json",\n    "x-api-key": "${currentUser.apiKey}"\n}\ndata = {\n    "title": "APIからのテストメモ",\n    "content": "このメモは外部API経由で送信されました。"\n}\n\nresponse = requests.post(url, json=data)\nprint(response.json())`;
                        } else if (helpCodeTab === "js") {
                          codeText = `const url = "${window.location.origin}/api/external/memos";\nconst apiKey = "${currentUser.apiKey}";\n\nfetch(url, {\n  method: "POST",\n  headers: {\n    "Content-Type": "application/json",\n    "x-api-key": apiKey\n  },\n  body: JSON.stringify({\n    title: "APIからのテストメモ",\n    content: "このメモは外部API経由で送信されました。"\n  })\n})\n.then(res => res.json())\n.then(console.log);`;
                        } else if (helpCodeTab === "agent") {
                          codeText = `あなたは高度なAIエージェント（または開発アシスタント）です。
ユーザーから「LLM Wikiにメモを自動登録するシステムや連携スクリプトを作ってほしい」、あるいは「外部の情報を自動収集してLLM Wikiに保存してほしい」という依頼を受けました。

以下のAPI接続仕様を完全に理解し、これを利用して指定された外部システム（Slack, Web, メール, カレンダー等）と連携するスクリプト、自動化プログラム（Python, Node.js等）、またはツール統合ワークフロー（Make, Custom Actions等）を構築してください。

【連携APIの仕様書】
- HTTP メソッド: POST
- リクエストURL: ${window.location.origin}/api/external/memos
- リクエストヘッダー:
    - Content-Type: application/json
    - x-api-key: ${currentUser.apiKey}
- リクエストボディ (JSON):
    {
      "title": "メモのタイトル（必須。一目で概要が伝わるもの）",
      "content": "メモの本文（任意。# 見出し、- 箇条書き、| 表 | などのMarkdown形式に対応。自動的に他メモと自動バックリンクされナレッジグラフ化されます）"
    }

【推奨される実装アプローチ】
1. 自律実行モードの場合: ユーザーの指示や監視イベント（新しいWeb記事、カレンダーの終了、Slackの発言等）をトリガーに、要約したリッチなMarkdownテキストを作成し、上記API宛てにHTTPリクエストを送信してください。
2. 開発アシスタントモードの場合: ユーザーが使用したいプログラミング言語（Python, JavaScript, Go等）やプラットフォーム（iOS Shortcuts, Google Apps Script, Make/Zapier等）に合わせた最適な接続・自動化コードを生成してください。`;
                        }
                        navigator.clipboard.writeText(codeText);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }}
                      className="absolute top-3 right-3 text-[10px] bg-slate-800/80 hover:bg-slate-700 hover:text-white border border-slate-700 px-2 py-1 rounded text-slate-400 font-semibold cursor-pointer transition-all"
                    >
                      {copiedCode ? "コピー完了!" : helpCodeTab === "agent" ? "プロンプトをコピー" : "コードをコピー"}
                    </button>
                    <pre className="font-mono text-xs text-indigo-200 leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                      {helpCodeTab === "curl" &&
`curl -X POST "${window.location.origin}/api/external/memos" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${currentUser.apiKey}" \\
  -d '{
    "title": "APIからのテストメモ",
    "content": "このメモは外部API経由で送信されました。"
  }'`}

                      {helpCodeTab === "python" &&
`import requests

url = "${window.location.origin}/api/external/memos"
headers = {
    "Content-Type": "application/json",
    "x-api-key": "${currentUser.apiKey}"
}
data = {
    "title": "APIからのテストメモ",
    "content": "このメモは外部API経由で送信されました。"
}

response = requests.post(url, json=data)
print(response.json())`}

                      {helpCodeTab === "js" &&
`const url = "${window.location.origin}/api/external/memos";
const apiKey = "${currentUser.apiKey}";

fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": apiKey
  },
  body: JSON.stringify({
    title: "APIからのテストメモ",
    content: "このメモは外部API経由で送信されました。"
  })
})
.then(res => res.json())
.then(console.log);`}

                      {helpCodeTab === "agent" &&
`あなたは高度なAIエージェント（または開発アシスタント）です。
ユーザーから「LLM Wikiにメモを自動登録するシステムや連携スクリプトを作ってほしい」、あるいは「外部の情報を自動収集してLLM Wikiに保存してほしい」という依頼を受けました。

以下のAPI接続仕様を完全に理解し、これを利用して指定された外部システム（Slack, Web, メール, カレンダー等）と連携するスクリプト、自動化プログラム（Python, Node.js等）、またはツール統合ワークフロー（Make, Custom Actions等）を構築してください。

【連携APIの仕様書】
- HTTP メソッド: POST
- リクエストURL: ${window.location.origin}/api/external/memos
- リクエストヘッダー:
    - Content-Type: application/json
    - x-api-key: ${currentUser.apiKey}
- リクエストボディ (JSON):
    {
      "title": "メモのタイトル（必須。一目で概要が伝わるもの）",
      "content": "メモの本文（任意。# 見出し、- 箇条書き、| 表 | などのMarkdown形式に対応。自動的に他メモと自動バックリンクされナレッジグラフ化されます）"
    }

【推奨される実装アプローチ】
1. 自律実行モードの場合: ユーザーの指示や監視イベント（新しいWeb記事、カレンダーの終了、Slackの発言等）をトリガーに、要約したリッチなMarkdownテキストを作成し、上記API宛てにHTTPリクエストを送信してください。
2. 開発アシスタントモードの場合: ユーザーが使用したいプログラミング言語（Python, JavaScript, Go等）やプラットフォーム（iOS Shortcuts, Google Apps Script, Make/Zapier等）に合わせた最適な接続・自動化コードを生成してください。`}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setShowApiHelpModal(false)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[85vh] border border-slate-200 shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 text-slate-800">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                <h3 className="font-display font-bold text-slate-950 text-base">AI連携設定</h3>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-xl p-1.5 cursor-pointer"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* API Help Quick Link for mobile */}
              <div className="flex items-center justify-between bg-indigo-50/50 rounded-xl px-3 py-2 border border-indigo-100 text-xs">
                <span className="text-indigo-950 font-medium">外部システムからの連携方法</span>
                <button
                  type="button"
                  onClick={() => {
                    setShowSettingsModal(false);
                    setShowApiHelpModal(true);
                  }}
                  className="text-indigo-600 hover:text-indigo-700 font-bold hover:underline cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>APIヘルプを開く</span>
                </button>
              </div>

              {/* Provider Selection */}
              <div>
                <label className="text-[11px] text-slate-400 font-bold block uppercase tracking-wider mb-1.5">
                  AI プロバイダー
                </label>
                <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsProvider("gemini");
                      setSettingsModel("gemini-3.5-flash");
                      setAvailableModels(DEFAULT_GEMINI_MODELS);
                      setModelSearchQuery("");
                    }}
                    className={`flex-1 py-2 rounded-md transition-all cursor-pointer text-center ${
                      settingsProvider === "gemini" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Gemini API
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsProvider("openai-compatible");
                      setSettingsModel("gpt-4o-mini");
                      setAvailableModels(DEFAULT_OPENAI_MODELS);
                      setModelSearchQuery("");
                    }}
                    className={`flex-1 py-2 rounded-md transition-all cursor-pointer text-center ${
                      settingsProvider === "openai-compatible" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    OpenAI互換 API
                  </button>
                </div>
              </div>

              {/* Endpoint (Only for openai-compatible) */}
              {settingsProvider === "openai-compatible" && (
                <div>
                  <label className="text-[11px] text-slate-400 font-bold block uppercase tracking-wider mb-1">
                    API エンドポイント URL
                  </label>
                  <input
                    type="text"
                    value={settingsEndpoint}
                    onChange={(e) => setSettingsEndpoint(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    例: https://api.openai.com/v1 や http://localhost:11434/v1
                  </p>
                </div>
              )}

              {/* API Key */}
              <div>
                <label className="text-[11px] text-slate-400 font-bold block uppercase tracking-wider mb-1">
                  API キー
                </label>
                <div className="relative">
                  <input
                    type={showSettingsKey ? "text" : "password"}
                    value={settingsApiKey}
                    onChange={(e) => setSettingsApiKey(e.target.value)}
                    placeholder={settingsProvider === "gemini" ? "未設定時はサーバーデフォルトを使用" : "必須キーを入力してください"}
                    className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-10 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSettingsKey(!showSettingsKey)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showSettingsKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Model Select and Dynamic Fetch */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-slate-400 font-bold block uppercase tracking-wider">
                    AI モデル
                  </label>
                  <button
                    type="button"
                    onClick={handleFetchModels}
                    disabled={isFetchingModels || (settingsProvider === "openai-compatible" && !settingsApiKey)}
                    className="text-[10px] text-indigo-600 hover:text-indigo-700 hover:underline font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    {isFetchingModels ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    <span>モデル一覧を取得</span>
                  </button>
                </div>

                {/* Selected Model (Manual typing enabled) */}
                <input
                  type="text"
                  value={settingsModel}
                  onChange={(e) => setSettingsModel(e.target.value)}
                  placeholder="モデル名を入力、または下のリストから検索して選択"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                />

                {/* Model filtering search box */}
                {availableModels.length > 0 && (
                  <div className="space-y-1 bg-slate-50 border border-slate-150 p-2.5 rounded-xl">
                    <input
                      type="text"
                      value={modelSearchQuery}
                      onChange={(e) => setModelSearchQuery(e.target.value)}
                      placeholder="モデル候補を絞り込み検索..."
                      className="w-full bg-white border border-slate-250/70 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-indigo-500 transition-colors"
                    />

                    {/* Scrollable Model List */}
                    <div className="max-h-32 overflow-y-auto scrollbar-thin mt-1 border border-slate-100 rounded-lg bg-white">
                      {(() => {
                        const filtered = availableModels.filter((m) =>
                          m.toLowerCase().includes(modelSearchQuery.toLowerCase())
                        );
                        if (filtered.length === 0) {
                          return (
                            <div className="p-3 text-center text-slate-400 text-xs">
                              該当するモデル候補がありません
                            </div>
                          );
                        }
                        return (
                          <div className="divide-y divide-slate-100">
                            {filtered.map((m) => (
                              <button
                                key={m}
                                type="button"
                                onClick={() => setSettingsModel(m)}
                                className={`w-full text-left px-3 py-2 text-xs font-mono transition-colors flex items-center justify-between hover:bg-slate-50 cursor-pointer ${
                                  settingsModel === m ? "bg-indigo-50/70 text-indigo-700 font-bold" : "text-slate-600"
                                }`}
                              >
                                <span className="truncate mr-2">{m}</span>
                                {settingsModel === m && (
                                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-sans font-bold shrink-0">
                                    選択中
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>

              {/* Theme Selection */}
              <div className="border-t border-slate-100 pt-4">
                <label className="text-[11px] text-slate-400 font-bold block uppercase tracking-wider mb-2">
                  カラーテーマ選択
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {THEMES.map((theme) => {
                    const isSelected = currentThemeId === theme.id;
                    return (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => handleThemeChange(theme.id)}
                        className={`p-2 rounded-xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                          isSelected
                            ? "border-indigo-600 bg-indigo-50/30 ring-1 ring-indigo-500 text-slate-900 font-semibold"
                            : "border-slate-200 hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 animate-in fade-in duration-100">
                          {/* Color dot */}
                          <div
                            className="w-3 h-3 rounded-full border border-slate-300 flex-shrink-0"
                            style={{ backgroundColor: theme.graphNodeColor }}
                          />
                          <span className="text-[11px] truncate">
                            {theme.name}
                          </span>
                        </div>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                  ※ テーマは即時に適用され、「設定を保存」ボタンを押すことで永続化されます。
                </p>
              </div>

              {/* Password Change Section */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <label className="text-[11px] text-slate-400 font-bold block uppercase tracking-wider">
                  パスワードの変更
                </label>
                <form onSubmit={handlePasswordChange} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                  <div className="flex items-center gap-1.5 text-slate-800">
                    <Lock className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold">ログインパスワードの変更</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    現在のログインパスワードを検証し、新しいパスワードに変更してデータを再暗号化します。
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 block">現在のパスワード</label>
                    <div className="relative">
                      <input
                        type={showCurrentPassphrase ? "text" : "password"}
                        value={currentPassphrase}
                        onChange={(e) => setCurrentPassphrase(e.target.value)}
                        placeholder="現在のパスワードを入力"
                        className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-10 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPassphrase(!showCurrentPassphrase)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showCurrentPassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 block">新しいパスワード (4文字以上)</label>
                    <div className="relative">
                      <input
                        type={showNewPassphrase ? "text" : "password"}
                        value={newPassphrase}
                        onChange={(e) => setNewPassphrase(e.target.value)}
                        placeholder="新しいパスワードを入力"
                        className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-10 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassphrase(!showNewPassphrase)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showNewPassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 block">新しいパスワードの確認</label>
                    <div className="relative">
                      <input
                        type={showConfirmNewPassphrase ? "text" : "password"}
                        value={confirmNewPassphrase}
                        onChange={(e) => setConfirmNewPassphrase(e.target.value)}
                        placeholder="新しいパスワードを再入力"
                        className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-10 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewPassphrase(!showConfirmNewPassphrase)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showConfirmNewPassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 block font-semibold">TOTP 2FA 認証コード</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={passwordChangeTotp}
                      onChange={(e) => setPasswordChangeTotp(e.target.value.replace(/\D/g, ""))}
                      placeholder="認証アプリの6桁コードを入力"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 tracking-widest text-center focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  {passwordChangeError && (
                    <p className="text-[10px] text-red-600 font-semibold">{passwordChangeError}</p>
                  )}
                  {passwordChangeSuccess && (
                    <p className="text-[10px] text-emerald-600 font-semibold">{passwordChangeSuccess}</p>
                  )}

                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2 rounded-lg cursor-pointer transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isChangingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                    <span>パスワードの変更を適用</span>
                  </button>
                </form>
              </div>

              {/* Account Deletion Section */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <label className="text-[11px] text-red-500 font-bold block uppercase tracking-wider">
                  アカウントの削除
                </label>
                <form onSubmit={handleDeleteAccount} className="p-3.5 rounded-xl border border-red-200 bg-red-50/50 space-y-3">
                  <p className="text-[10px] text-red-700 leading-relaxed font-medium">
                    ⚠️ 注意：アカウントを削除すると、作成したすべてのメモ、画像・ドキュメント、および設定データが完全に削除され、復元することはできません。
                  </p>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-600 block font-semibold">現在のパスワードで確認</label>
                    <div className="relative">
                      <input
                        type={showDeletePassphrase ? "text" : "password"}
                        value={deletePassphrase}
                        onChange={(e) => setDeletePassphrase(e.target.value)}
                        placeholder="パスワードを入力して削除を確定"
                        className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-10 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-red-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowDeletePassphrase(!showDeletePassphrase)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showDeletePassphrase ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-600 block font-semibold">TOTP 2FA 認証コード</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={deleteAccountTotp}
                      onChange={(e) => setDeleteAccountTotp(e.target.value.replace(/\D/g, ""))}
                      placeholder="認証アプリの6桁コードを入力"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-800 tracking-widest text-center focus:outline-none focus:border-red-500 transition-colors"
                    />
                  </div>

                  <div className="flex items-start gap-2 pt-1 bg-red-100/40 p-2.5 rounded-lg border border-red-200/50">
                    <input
                      type="checkbox"
                      id="confirmDeleteCheckbox"
                      checked={confirmDeleteCheckbox}
                      onChange={(e) => setConfirmDeleteCheckbox(e.target.checked)}
                      className="mt-0.5 rounded border-slate-300 text-red-600 focus:ring-red-500 cursor-pointer w-3.5 h-3.5"
                    />
                    <label htmlFor="confirmDeleteCheckbox" className="text-[10px] text-red-800 select-none cursor-pointer leading-relaxed">
                      <strong>【同意の確認】</strong> すべてのメモ、タグ、ファイル、およびアカウントデータを二度と復元できない形で完全に削除することに同意します。
                    </label>
                  </div>

                  {deleteAccountError && (
                    <p className="text-[10px] text-red-600 font-semibold">{deleteAccountError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={isDeletingAccount}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-2 rounded-lg cursor-pointer transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                  >
                    {isDeletingAccount ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserX className="w-3.5 h-3.5" />}
                    <span>アカウントを完全に削除</span>
                  </button>
                </form>
              </div>

              {/* Data Migration Section */}
              <div className="border-t border-slate-100 pt-4 space-y-4">
                <label className="text-[11px] text-slate-400 font-bold block uppercase tracking-wider">
                  データ移行 (インポート / エクスポート)
                </label>
                
                {/* Export Card */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-slate-800">
                    <Download className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold">データをエクスポート</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    すべてのメモデータを暗号化してJSONファイルとしてダウンロードします。
                  </p>
                  
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 block">暗号化用パスワード</label>
                    <div className="relative">
                      <input
                        type={showExportPassword ? "text" : "password"}
                        value={exportPassword}
                        onChange={(e) => setExportPassword(e.target.value)}
                        placeholder="任意の暗号化パスワード"
                        className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-10 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowExportPassword(!showExportPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showExportPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {exportError && (
                    <p className="text-[10px] text-red-600 font-semibold">{exportError}</p>
                  )}
                  {exportSuccess && (
                    <p className="text-[10px] text-emerald-600 font-semibold">エクスポートが完了しました！</p>
                  )}

                  <button
                    type="button"
                    onClick={handleExportData}
                    disabled={isExporting}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 rounded-lg cursor-pointer transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    <span>エクスポート実行</span>
                  </button>
                </div>

                {/* Import Card */}
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                  <div className="flex items-center gap-1.5 text-slate-800">
                    <Upload className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold">データをインポート</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    暗号化されたJSONファイルからメモデータを読み込みます。
                  </p>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 block">ファイル選択</label>
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setSelectedImportFile(e.target.files[0]);
                          setImportError(null);
                        }
                      }}
                      className="w-full text-xs text-slate-600 file:mr-2.5 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-slate-200 file:text-slate-800 hover:file:bg-slate-300 file:cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 block">復号用パスワード</label>
                    <div className="relative">
                      <input
                        type={showImportPassword ? "text" : "password"}
                        value={importPassword}
                        onChange={(e) => setImportPassword(e.target.value)}
                        placeholder="エクスポート時と同じパスワード"
                        className="w-full bg-white border border-slate-200 rounded-lg pl-3 pr-10 py-1.5 text-xs font-mono text-slate-800 focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowImportPassword(!showImportPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showImportPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 block">取り込み方法</label>
                    <div className="flex gap-4">
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === "merge"}
                          onChange={() => setImportMode("merge")}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>追加・上書き</span>
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="radio"
                          name="importMode"
                          checked={importMode === "overwrite"}
                          onChange={() => setImportMode("overwrite")}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>完全上書き</span>
                      </label>
                    </div>
                  </div>

                  {importError && (
                    <p className="text-[10px] text-red-600 font-semibold">{importError}</p>
                  )}
                  {importSuccess && (
                    <p className="text-[10px] text-emerald-600 font-semibold">{importSuccess}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleImportData}
                    disabled={isImporting || !selectedImportFile || !importPassword}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2 rounded-lg cursor-pointer transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>インポート実行</span>
                  </button>
                </div>
              </div>

              {/* AI Batch Processing Section */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <label className="text-[11px] text-slate-400 font-bold block uppercase tracking-wider">
                  AIによる一括再生成
                </label>
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                  <div className="flex items-center gap-1.5 text-slate-800">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold">全メモの要約・タグ・関連付けを再構築</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    現在設定・保存されているAIモデル（または自動フォールバック）を使用して、すべてのメモの要約、5つのタグ、およびナレッジグラフの接続（バックリンク）を一から自動で一括再生成します。
                  </p>

                  {batchRegenerateError && (
                    <p className="text-[10px] text-red-600 font-semibold">{batchRegenerateError}</p>
                  )}
                  {batchRegenerateSuccess && (
                    <p className="text-[10px] text-emerald-600 font-semibold">{batchRegenerateSuccess}</p>
                  )}

                  <button
                    type="button"
                    onClick={handleBatchRegenerateMetadata}
                    disabled={isBatchRegenerating}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 rounded-lg cursor-pointer transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {isBatchRegenerating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>一括再生成を実行する</span>
                  </button>
                </div>
              </div>

              {/* Error and Success states */}
              {settingsError && (
                <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-lg border border-red-100 font-semibold leading-relaxed">
                  {settingsError}
                </div>
              )}

              {settingsSuccess && (
                <div className="bg-emerald-50 text-emerald-700 text-xs px-3 py-2 rounded-lg border border-emerald-100 font-semibold">
                  設定を保存しました。
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-semibold text-xs px-4 py-2 rounded-lg cursor-pointer transition-colors"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSavingSettings && <Loader2 className="w-3 h-3 animate-spin" />}
                <span>設定を保存</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Multimedia Capture/Record Modal */}
      <MultimediaModal
        isOpen={showMultimediaModal}
        onClose={() => setShowMultimediaModal(false)}
        activeTheme={activeTheme}
        token={token}
        onProcessResult={(title, content) => {
          handleCreateMemo(title, content);
        }}
      />

      {/* Global Floating AI Assistant Trigger FAB */}
      <button
        onClick={() => setShowChatPopup(!showChatPopup)}
        className={`fixed bottom-6 right-6 p-4 rounded-full text-white shadow-2xl active:scale-95 transition-all duration-300 z-40 flex items-center justify-center cursor-pointer group ${activeTheme.accentBg} ${activeTheme.accentBgHover}`}
        title="AIアシスタントを開く"
      >
        {showChatPopup ? (
          <X className="w-5 h-5 animate-in spin-in-90 duration-200" />
        ) : (
          <Sparkles className="w-5 h-5 animate-pulse" />
        )}
        <span className="max-w-0 overflow-hidden group-hover:max-w-xs group-hover:ml-2 text-xs font-semibold whitespace-nowrap transition-all duration-300 ease-in-out hidden sm:inline-block">
          AIアシスタント
        </span>
      </button>

      {/* Global AI Assistant Floating Popup Window / Full-screen Sheet on Mobile */}
      {showChatPopup && (
        <>
          {/* Mobile Overlay backdrop to focus focus */}
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] z-40 sm:hidden animate-in fade-in duration-200"
            onClick={() => setShowChatPopup(false)}
          />

          <div className={`
            fixed inset-x-0 bottom-0 sm:inset-auto sm:bottom-24 sm:right-6 w-full sm:w-[420px] md:w-[460px] h-[82vh] sm:h-[600px] rounded-t-3xl sm:rounded-2xl border shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-200
            ${activeTheme.border} ${activeTheme.cardBg}
          `}>
            {/* Header */}
            <div className={`px-4 py-3.5 border-b flex items-center justify-between select-none ${activeTheme.sidebarBg} ${activeTheme.border}`}>
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white ${activeTheme.accentBg} animate-pulse shadow-sm`}>
                  <Bot className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className={`text-xs font-bold ${activeTheme.textMain}`}>AIアシスタント</div>
                  <div className={`text-[9px] font-mono leading-none ${activeTheme.textMuted}`}>リアルタイムナレッジ参照</div>
                </div>
              </div>
              <button
                onClick={() => setShowChatPopup(false)}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${activeTheme.textMuted} hover:${activeTheme.textMain} hover:${activeTheme.tagBg}`}
                title="閉じる"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Content Panel */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <AiSearchChat
                memos={memos}
                activeTheme={activeTheme}
                token={token}
                onSelectMemo={(id) => {
                  setSelectedMemoId(id);
                  setActiveTab("memo");
                  if (window.innerWidth < 640) {
                    setShowChatPopup(false);
                  }
                }}
                setActiveTab={setActiveTab}
                onRefreshMemosAndSelect={handleRefreshMemosAndSelect}
              />
            </div>
          </div>
        </>
      )}

    </div>
  );
}
