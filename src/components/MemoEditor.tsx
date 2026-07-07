/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Edit3, Eye, Trash2, Sparkles, RefreshCw, Save, ArrowUpRight, ArrowDownLeft, Hash, X, ChevronDown, Download, Activity } from "lucide-react";
import { Memo } from "../types";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ThemePreset } from "../App";
import { AiSearchChat } from "./AiSearchChat";

interface MemoEditorProps {
  memo: Memo | null;
  allMemos: Memo[];
  onSave: (id: string, title: string, content: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRegenerateMetadata: (id: string) => Promise<void>;
  onSelectMemo: (memoId: string | null) => void;
  activeTheme: ThemePreset;
  token: string | null;
  onRefreshMemosAndSelect?: (selectId?: string) => Promise<void>;
}

export function MemoEditor({
  memo,
  allMemos,
  onSave,
  onDelete,
  onRegenerateMetadata,
  onSelectMemo,
  activeTheme,
  token,
  onRefreshMemosAndSelect,
}: MemoEditorProps) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [showInspector, setShowInspector] = useState(() => typeof window !== "undefined" ? window.innerWidth >= 768 : true);
  const [isSaving, setIsSaving] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Local Saving/Download States
  const [showSaveDropdown, setShowSaveDropdown] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [enteredFilename, setEnteredFilename] = useState("");
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "audio" | "video") => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setIsUploadingMedia(true);

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(",")[1] || result;
          resolve(base64);
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fileData: base64Data,
          mimeType: file.type,
          fileName: file.name,
        }),
      });

      if (!res.ok) {
        throw new Error(`Upload failed with status ${res.status}`);
      }

      const data = await res.json();
      if (data.success && data.url) {
        const prefix = type === "image" ? "画像" : type === "audio" ? "音声" : "動画";
        const cleanName = file.name.split(".")[0];
        const markdownTag = `\n![${prefix}: ${cleanName}](${data.url})\n`;
        setContent((prev) => prev + markdownTag);
      }
    } catch (err: any) {
      console.error("Failed to upload file:", err);
      alert("ファイルのアップロードに失敗しました: " + err.message);
    } finally {
      setIsUploadingMedia(false);
    }
  };

  // Sync state with selected memo
  useEffect(() => {
    if (memo) {
      setTitle(memo.title);
      setContent(memo.content);
      setMode("preview"); // Default back to preview mode on memo switch
      setShowDeleteConfirm(false);
    } else {
      setTitle("");
      setContent("");
      setShowDeleteConfirm(false);
    }
  }, [memo]);

  if (!memo) {
    return (
      <div className={`flex-1 h-full flex flex-col items-center justify-center text-center p-8 select-none ${activeTheme.textMuted}`}>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 animate-pulse border ${activeTheme.cardBg} ${activeTheme.border}`}>
          <Edit3 className="w-6 h-6 opacity-60" />
        </div>
        <p className={`font-display font-medium mb-1 ${activeTheme.textMain}`}>メモを選択または作成</p>
        <p className="text-xs max-w-xs leading-relaxed opacity-80">
          左側のサイドパネルから編集するメモを選択するか、「新規メモ」ボタンをクリックして新しいナレッジを構築し始めてください。
        </p>
      </div>
    );
  }

  // Find incoming references (backlinks)
  const backlinks = allMemos.filter((m) => m.relatedMemoIds && m.relatedMemoIds.includes(memo.id));

  // Find outgoing resolved memo links
  const outgoingLinks = allMemos.filter((m) => memo.relatedMemoIds && memo.relatedMemoIds.includes(m.id));

  const handleSaveClick = async () => {
    setIsSaving(true);
    try {
      await onSave(memo.id, title, content);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateClick = async () => {
    setIsRegenerating(true);
    try {
      await onRegenerateMetadata(memo.id);
    } finally {
      setIsRegenerating(false);
    }
  };

  // Initialize save to local file
  const handleDownloadInit = () => {
    const defaultName = title.trim() ? `${title.trim()}.txt` : "無題のメモ.txt";
    setEnteredFilename(defaultName.endsWith(".txt") ? defaultName : `${defaultName}.txt`);
    setShowDownloadDialog(true);
  };

  // Create local file download
  const executeDownload = async () => {
    if (!enteredFilename.trim()) return;

    // 1. Try OS Standard File System Access API if supported
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: enteredFilename.trim(),
          types: [{
            description: "Text Files",
            accept: {
              "text/plain": [".txt"],
            },
          }],
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();

        setShowDownloadDialog(false);
        alert("指定した場所にファイルを保存しました。");
        return;
      } catch (err: any) {
        // If the user cancelled the dialog, just return
        if (err.name === "AbortError") {
          return;
        }
        console.warn("showSaveFilePicker failed/blocked, falling back to classic download:", err);
      }
    }

    // 2. Fallback to classic anchor download
    try {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = enteredFilename.trim();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      setShowDownloadDialog(false);
      alert(`ファイルを「${enteredFilename.trim()}」としてローカルにダウンロード保存しました。`);
    } catch (err: any) {
      alert("ダウンロード保存に失敗しました: " + err.message);
    }
  };

  return (
    <div className={`flex-1 h-full flex flex-col min-w-0 ${activeTheme.bg}`}>
      {/* Editor Header Menu */}
      <div className={`px-4 md:px-6 py-2 md:py-3 border-b flex flex-wrap md:flex-nowrap items-center justify-between gap-2 md:gap-4 shrink-0 ${activeTheme.border} ${activeTheme.sidebarBg}`}>
        <div className="flex items-center gap-1.5">
          {/* Mode Tabs */}
          <div className={`p-1 rounded-lg flex items-center gap-1 ${activeTheme.tagBg}`}>
            <button
              onClick={() => setMode("edit")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                mode === "edit"
                  ? `${activeTheme.cardBg} ${activeTheme.textMain} shadow-sm`
                  : `${activeTheme.textMuted} hover:${activeTheme.textMain}`
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>編集</span>
            </button>
            <button
              onClick={() => setMode("preview")}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                mode === "preview"
                  ? `${activeTheme.cardBg} ${activeTheme.textMain} shadow-sm`
                  : `${activeTheme.textMuted} hover:${activeTheme.textMain}`
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>プレビュー</span>
            </button>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* AI Info Sidebar Toggle */}
          <button
            onClick={() => setShowInspector(!showInspector)}
            title={showInspector ? "分析パネルを非表示" : "分析パネルを表示"}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-all cursor-pointer border text-xs font-semibold ${
              showInspector
                ? `${activeTheme.accentText} ${activeTheme.accentBorder} ${activeTheme.accentLight}`
                : `${activeTheme.textMuted} ${activeTheme.border} hover:${activeTheme.textMain}`
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-indigo-500" />
            <span className="hidden sm:inline">AI分析パネル</span>
          </button>

          {/* Combined Save/Download Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSaveDropdown(!showSaveDropdown)}
              disabled={isSaving}
              className={`flex items-center justify-center gap-1.5 text-white text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer font-semibold font-sans shadow-sm ${activeTheme.accentBg} ${activeTheme.accentBgHover} disabled:opacity-50`}
            >
              {isSaving ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span>保存・ダウンロード</span>
              <ChevronDown className="w-3 h-3 opacity-80" />
            </button>

            {showSaveDropdown && (
              <div className="absolute right-0 mt-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-1 flex flex-col gap-0.5 text-xs text-slate-700 animate-in fade-in slide-in-from-top-1 duration-150">
                <button
                  type="button"
                  onClick={() => {
                    setShowSaveDropdown(false);
                    handleSaveClick();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex flex-col gap-0.5 cursor-pointer"
                >
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Save className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Wikiに保存</span>
                  </span>
                  <span className="text-[10px] text-slate-400">サーバーへ変更内容を保存します。</span>
                </button>

                <div className="border-t border-slate-100 my-1" />

                <button
                  type="button"
                  onClick={() => {
                    setShowSaveDropdown(false);
                    handleDownloadInit();
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 flex flex-col gap-0.5 cursor-pointer"
                >
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Download className="w-3.5 h-3.5 text-indigo-600" />
                    <span>ローカルにテキスト保存</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    プレーンテキストとしてダウンロードします。
                  </span>
                </button>
              </div>
            )}
          </div>

          {/* Close Button */}
          <button
            onClick={() => onSelectMemo(null)}
            title="メモを閉じる"
            className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-all cursor-pointer ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain} hover:${activeTheme.tagBg}`}
          >
            <X className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">閉じる</span>
          </button>

          {/* Delete Button / Inline Confirm UI */}
          {showDeleteConfirm ? (
            <div className="flex items-center gap-1 bg-red-500/10 border border-red-500/20 rounded-lg px-2 py-1 transition-all">
              <span className="text-[10px] text-red-500 font-semibold select-none hidden sm:inline">
                削除？
              </span>
              <button
                onClick={async () => {
                  await onDelete(memo.id);
                  setShowDeleteConfirm(false);
                }}
                className="text-[10px] bg-red-600 hover:bg-red-700 text-white font-bold px-2 py-1 rounded cursor-pointer transition-all shadow-sm"
              >
                削除
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className={`text-[10px] font-semibold px-1.5 py-1 rounded cursor-pointer transition-all border ${activeTheme.buttonSecondary}`}
              >
                止める
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              title="メモを削除"
              className={`flex items-center justify-center p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg border transition-all cursor-pointer ${activeTheme.border}`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Editor Main Split Workspace */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row min-h-0 bg-transparent">
        {/* Left/Main Column: Editor */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 lg:h-full">
          {/* Scrollable Editor Area */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
            <div className="flex-1 flex flex-col min-w-0 h-full max-w-5xl mx-auto w-full">
              {/* Title Input */}
              <input
                type="text"
                placeholder="タイトルを入力してください..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={mode === "preview"}
                className={`w-full font-display font-bold text-3xl border-none px-0 py-2 focus:outline-none focus:ring-0 mb-4 shrink-0 tracking-tight bg-transparent ${activeTheme.textMain} placeholder-slate-400/60`}
              />

              {/* Content Pane */}
              {mode === "edit" ? (
                <div className="flex-1 flex flex-col min-h-[300px]">
                  {/* Media Insert Toolbar */}
                  <div className="flex flex-wrap items-center gap-2 border-b pb-2 mb-3 select-none">
                    <label className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border cursor-pointer hover:bg-opacity-80 transition-all ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain}`}>
                      <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      <span>画像を挿入</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleMediaUpload(e, "image")}
                      />
                    </label>
                    <label className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border cursor-pointer hover:bg-opacity-80 transition-all ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain}`}>
                      <svg className="w-3.5 h-3.5 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      <span>音声を挿入</span>
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={(e) => handleMediaUpload(e, "audio")}
                      />
                    </label>
                    <label className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border cursor-pointer hover:bg-opacity-80 transition-all ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain}`}>
                      <svg className="w-3.5 h-3.5 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span>動画を挿入</span>
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={(e) => handleMediaUpload(e, "video")}
                      />
                    </label>
                    {isUploadingMedia && (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1 animate-pulse ml-2">
                        <RefreshCw className="w-3 h-3 animate-spin text-indigo-500" />
                        <span>アップロード中...</span>
                      </span>
                    )}
                  </div>
                  <textarea
                    placeholder="ここにメモを記述してください (Markdown対応)..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className={`w-full flex-1 border-none focus:outline-none resize-none font-sans text-sm leading-relaxed p-0 focus:ring-0 overflow-y-auto bg-transparent ${activeTheme.textMain} placeholder-slate-400/60`}
                  />
                </div>
              ) : (
                <div className={`flex-1 overflow-y-auto border-t pt-6 max-w-none min-h-[300px] ${activeTheme.border}`}>
                  <MarkdownRenderer content={content} onLinkClick={onSelectMemo} allMemos={allMemos} activeTheme={activeTheme} token={token || undefined} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: AI Analysis Inspector Sidebar */}
        {showInspector && (
          <div className={`
            w-full lg:w-[320px] xl:w-[360px] h-[280px] sm:h-[320px] lg:h-full flex flex-col shrink-0 border-t lg:border-t-0 lg:border-l p-4 sm:p-5 gap-6 select-none overflow-y-auto
            ${activeTheme.border} ${activeTheme.sidebarBg}
          `}>
            <div className="flex items-center justify-between border-b pb-3 shrink-0" style={{ borderColor: "var(--color-border, currentColor)" }}>
              <div className="flex items-center gap-1.5">
                <Activity className={`w-4 h-4 ${activeTheme.accentText}`} />
                <h3 className={`text-xs font-bold ${activeTheme.textMain}`}>AI分析パネル</h3>
              </div>
              
              {/* Regenerate AI Connections */}
              <button
                onClick={handleRegenerateClick}
                disabled={isRegenerating}
                title="AIタグと関係リンクを再生成"
                className={`flex items-center gap-1.5 px-2 py-1 rounded hover:${activeTheme.tagBg} transition-all disabled:opacity-50 border text-[10px] font-bold ${activeTheme.accentText} ${activeTheme.accentBorder}`}
              >
                <RefreshCw className={`w-3 h-3 ${isRegenerating ? "animate-spin" : ""}`} />
                <span>分析更新</span>
              </button>
            </div>

            {/* AI Summary Section */}
            <div className="space-y-2">
              <h4 className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${activeTheme.textMuted}`}>
                <Sparkles className={`w-3 h-3 ${activeTheme.accentText}`} />
                <span>AI要約</span>
              </h4>
              {memo?.summary ? (
                <div className={`p-3 rounded-xl border text-xs leading-relaxed ${activeTheme.tagBg} ${activeTheme.border} ${activeTheme.textMain}`}>
                  {memo.summary}
                </div>
              ) : (
                <p className={`text-[11px] italic ${activeTheme.textMuted}`}>要約がありません。保存すると自動生成されます。</p>
              )}
            </div>

            {/* AI Tags Section */}
            <div className="space-y-2">
              <h4 className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${activeTheme.textMuted}`}>
                <Sparkles className={`w-3 h-3 ${activeTheme.accentText}`} />
                <span>AIタグ</span>
              </h4>
              {memo?.tags && memo.tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {memo.tags.map((tag, idx) => {
                    const cleaned = tag.trim().replace(/^#+/, "").trim();
                    return (
                      <span
                        key={idx}
                        className={`inline-flex items-center gap-0.5 text-[10px] font-mono font-semibold px-2.5 py-1 rounded border shadow-sm ${activeTheme.accentLight} ${activeTheme.accentLightText} ${activeTheme.accentBorder}`}
                      >
                        <Hash className="w-2.5 h-2.5 opacity-60" />
                        <span>{cleaned}</span>
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className={`text-[11px] italic ${activeTheme.textMuted}`}>タグがありません。メモを保存するか、上の更新ボタンを押してください。</p>
              )}
            </div>

            {/* Outgoing Links */}
            <div className="space-y-2">
              <h4 className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${activeTheme.textMuted}`}>
                <ArrowUpRight className="w-3.5 h-3.5 opacity-65" />
                <span>関連メモ（送信リンク）</span>
              </h4>
              {outgoingLinks.length > 0 ? (
                <div className="space-y-1.5">
                  {outgoingLinks.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onSelectMemo(m.id)}
                      className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center justify-between gap-2 cursor-pointer font-sans border ${activeTheme.cardBg} ${activeTheme.border} hover:border-indigo-500/30 hover:${activeTheme.accentLight}`}
                    >
                      <span className={`font-semibold truncate ${activeTheme.textMain}`}>{m.title || "無題のメモ"}</span>
                      <span className={`text-[10px] font-bold shrink-0 ${activeTheme.accentText}`}>開く</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={`text-[11px] italic ${activeTheme.textMuted}`}>関連するリンクは設定されていません。</p>
              )}
            </div>

            {/* Incoming References / Backlinks */}
            <div className="space-y-2">
              <h4 className={`text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${activeTheme.textMuted}`}>
                <ArrowDownLeft className="w-3.5 h-3.5 opacity-65" />
                <span>被リンク（被参照）</span>
              </h4>
              {backlinks.length > 0 ? (
                <div className="space-y-1.5">
                  {backlinks.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => onSelectMemo(m.id)}
                      className={`w-full text-left p-2.5 rounded-xl text-xs transition-all flex items-center justify-between gap-2 cursor-pointer font-sans border ${activeTheme.cardBg} ${activeTheme.border} hover:border-indigo-500/30 hover:${activeTheme.accentLight}`}
                    >
                      <span className={`font-semibold truncate ${activeTheme.textMain}`}>{m.title || "無題のメモ"}</span>
                      <span className={`text-[10px] font-bold shrink-0 ${activeTheme.accentText}`}>開く</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={`text-[11px] italic ${activeTheme.textMuted}`}>このメモへのバックリンクはありません。</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Download Save Naming Modal */}
      {showDownloadDialog && (
        <div className="fixed inset-0 bg-slate-950/40 z-50 flex items-center justify-center p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl shadow-xl p-6 text-slate-800 space-y-4">
            <div>
              <h4 className="font-display font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                <span className="text-indigo-600">📥</span> ローカルにダウンロード保存
              </h4>
              <p className="text-[11px] text-slate-400 font-sans mt-0.5">ダウンロードするプレーンテキストファイルのファイル名を設定してください。</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">ファイル名 (.txt)</label>
              <input
                type="text"
                value={enteredFilename}
                onChange={(e) => setEnteredFilename(e.target.value)}
                placeholder="memo.txt"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowDownloadDialog(false);
                }}
                className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-xs font-semibold cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={executeDownload}
                disabled={!enteredFilename.trim()}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg disabled:opacity-50 cursor-pointer shadow-sm flex items-center gap-1"
              >
                <span>ダウンロードする</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
