/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Search, Plus, Hash, FolderClosed, FileText, X } from "lucide-react";
import { Memo } from "../types";
import { ThemePreset } from "../App";

interface SidebarProps {
  memos: Memo[];
  selectedMemoId: string | null;
  onSelectMemo: (memoId: string | null) => void;
  onCreateMemo: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  activeTheme: ThemePreset;
  search?: string;
  onSearchChange?: (search: string) => void;
}

export function Sidebar({
  memos,
  selectedMemoId,
  onSelectMemo,
  onCreateMemo,
  isOpen,
  setIsOpen,
  activeTheme,
  search: searchProp,
  onSearchChange: onSearchChangeProp,
}: SidebarProps) {
  const [localSearch, setLocalSearch] = useState("");

  const search = searchProp !== undefined ? searchProp : localSearch;
  const setSearch = onSearchChangeProp !== undefined ? onSearchChangeProp : setLocalSearch;

  const [showTagList, setShowTagList] = useState(false);
  const [tagSearchQuery, setTagSearchQuery] = useState("");

  // Collect all unique tags and their usage count
  const tagListMap = new Map<string, { display: string; count: number }>();
  memos.forEach((m) => {
    if (m.tags) {
      m.tags.forEach((tag) => {
        if (tag && tag.trim()) {
          const cleaned = tag.trim().replace(/^#+/, "").trim();
          const key = cleaned.toLowerCase();
          if (key) {
            const existing = tagListMap.get(key);
            if (existing) {
              existing.count += 1;
            } else {
              tagListMap.set(key, { display: cleaned, count: 1 });
            }
          }
        }
      });
    }
  });
  const allTags = Array.from(tagListMap.values())
    .filter(Boolean)
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display));

  const filteredTagsInModal = allTags.filter((t) =>
    t.display.toLowerCase().includes(tagSearchQuery.toLowerCase())
  );

  const handleTagClick = (tagName: string) => {
    setSearch((prev) => {
      const tagWithHash = `#${tagName}`;
      const words = prev.split(/\s+/).filter(Boolean);
      const isIncluded = words.some(w => w.toLowerCase() === tagWithHash.toLowerCase());

      if (isIncluded) {
        const updatedWords = words.filter(w => w.toLowerCase() !== tagWithHash.toLowerCase());
        return updatedWords.join(" ") + (updatedWords.length > 0 ? " " : "");
      } else {
        const trimmed = prev.trim();
        return trimmed ? `${trimmed} ${tagWithHash} ` : `${tagWithHash} `;
      }
    });
  };

  const isTagActive = (tagName: string) => {
    const tagWithHash = `#${tagName}`;
    const words = search.split(/\s+/).filter(Boolean);
    return words.some(w => w.toLowerCase() === tagWithHash.toLowerCase());
  };

  // Filter memos by search query (supports multiple space-separated terms and #tag syntax)
  const filteredMemos = memos.filter((memo) => {
    const cleanSearch = search.trim().toLowerCase();
    if (!cleanSearch) return true;

    const searchTerms = cleanSearch.split(/\s+/).filter(Boolean);

    return searchTerms.every((term) => {
      const isTagSearch = term.startsWith("#");
      const cleanTerm = isTagSearch ? term.substring(1) : term;

      if (isTagSearch) {
        return memo.tags && memo.tags.some((t) => t.toLowerCase().includes(cleanTerm));
      } else {
        const inTitle = memo.title.toLowerCase().includes(cleanTerm);
        const inContent = memo.content.toLowerCase().includes(cleanTerm);
        const inTags = memo.tags && memo.tags.some((t) => t.toLowerCase().includes(cleanTerm));
        return inTitle || inContent || inTags;
      }
    });
  });

  return (
    <div
      className={`fixed md:relative top-0 bottom-0 left-0 h-full border-r transition-all duration-300 flex flex-col z-30 ${activeTheme.border} ${activeTheme.bg} ${
        isOpen
          ? "w-[280px] sm:w-[300px] translate-x-0 shadow-xl md:shadow-none"
          : "w-[280px] sm:w-[300px] -translate-x-full md:w-0 md:translate-x-0 overflow-hidden"
      }`}
    >
      {/* Search and Action area */}
      <div className={`p-4 border-b space-y-3 shrink-0 ${activeTheme.border} ${activeTheme.sidebarBg}`}>
        <div className="flex items-center justify-between gap-2">
          <div className={`flex items-center gap-1.5 font-display font-medium text-sm ${activeTheme.textMain}`}>
            <FolderClosed className="w-4 h-4 opacity-70" />
            <span>メモ一覧</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold font-mono ${activeTheme.tagBg} ${activeTheme.tagText}`}>
              {filteredMemos.length}
            </span>
          </div>

          <button
            onClick={() => onCreateMemo()}
            className={`flex items-center justify-center gap-1 text-white text-xs px-3 py-1.5 rounded-lg transition-all cursor-pointer font-semibold font-sans shadow-sm ${activeTheme.accentBg} ${activeTheme.accentBgHover}`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新規メモ</span>
          </button>
        </div>

        {/* Search Input and Tag List button */}
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="メモを検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full px-3 pl-8 pr-7 py-1.5 rounded text-xs focus:outline-none transition-all font-sans ${activeTheme.inputBg} border ${activeTheme.border} ${activeTheme.textMain}`}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-2 w-5 h-5 flex items-center justify-center text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                title="検索条件をクリア"
              >
                ×
              </button>
            )}
          </div>

        {/* Tag List toggle button */}
        <button
          onClick={() => {
            setShowTagList(!showTagList);
            setTagSearchQuery("");
          }}
          className={`px-2 py-1.5 rounded text-[11px] font-semibold border flex items-center gap-0.5 transition-all cursor-pointer ${
            showTagList
              ? `${activeTheme.accentBg} text-white border-transparent`
              : `${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain} hover:${activeTheme.tagBg}`
          }`}
          title="すべてのタグを表示"
        >
          <Hash className="w-3 h-3" />
          <span>タグ一覧</span>
        </button>
      </div>
    </div>

      {/* Memos list view */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {filteredMemos.length === 0 ? (
          <div className={`p-8 text-center m-2 rounded-lg border ${activeTheme.textMuted} ${activeTheme.cardBg} ${activeTheme.border}`}>
            <FileText className="w-8 h-8 mx-auto opacity-30 mb-2" />
            <p className="text-xs">メモが見つかりません</p>
          </div>
        ) : (
          filteredMemos.map((memo) => {
            const isSelected = selectedMemoId === memo.id;
            const cleanContent = memo.content.replace(/[#*`_\[\]]/g, "").substring(0, 50);

            return (
              <button
                key={memo.id}
                onClick={() => {
                  onSelectMemo(memo.id);
                  if (window.innerWidth < 768) {
                    setIsOpen(false);
                  }
                }}
                className={`w-full p-3 text-left transition-all flex flex-col gap-1.5 rounded-lg cursor-pointer border ${
                  isSelected
                    ? `${activeTheme.cardBg} shadow-sm ${activeTheme.border} ${activeTheme.textMain}`
                    : `text-slate-500 border-transparent hover:${activeTheme.cardBg} hover:border-slate-200/40`
                }`}
              >
                <div className="flex items-start justify-between gap-2 w-full">
                  <span
                    className={`text-xs font-semibold line-clamp-1 truncate ${
                      isSelected ? activeTheme.accentText : activeTheme.textMain
                    }`}
                  >
                    {memo.title || "無題のメモ"}
                  </span>
                  <span className={`text-[9px] font-mono shrink-0 ${activeTheme.textMuted}`}>
                    {new Date(memo.updatedAt).toLocaleDateString("ja-JP", {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </span>
                </div>

                <p className={`text-[11px] line-clamp-2 leading-relaxed ${activeTheme.textMuted}`}>
                  {memo.summary || cleanContent || "本文なし..."}
                </p>

                {/* Tags Badge List */}
                {memo.tags && memo.tags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1 mt-1">
                    {memo.tags.slice(0, 3).map((tag, idx) => {
                      const cleaned = tag.trim().replace(/^#+/, "").trim();
                      return (
                        <span
                          key={idx}
                          className={`text-[9px] px-1.5 py-0.5 rounded font-mono border ${activeTheme.tagBg} ${activeTheme.tagText} ${activeTheme.border}`}
                        >
                          #{cleaned}
                        </span>
                      );
                    })}
                    {memo.tags.length > 3 && (
                      <span className={`text-[8px] font-semibold font-sans ${activeTheme.textMuted}`}>
                        +{memo.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Global Tags Popup Modal */}
      {showTagList && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div 
            className="fixed inset-0" 
            onClick={() => setShowTagList(false)} 
          />
          <div className={`relative rounded-2xl max-w-md w-full max-h-[80vh] border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150 ${activeTheme.cardBg} ${activeTheme.border} ${activeTheme.textMain}`}>
            {/* Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${activeTheme.sidebarBg} ${activeTheme.border}`}>
              <div className="flex items-center gap-2">
                <Hash className={`w-5 h-5 ${activeTheme.accentText}`} />
                <div>
                  <h3 className="font-display font-bold text-base leading-tight">全タグ一覧</h3>
                  <p className={`text-[10px] font-mono leading-none mt-0.5 ${activeTheme.textMuted}`}>
                    登録タグ総数: {allTags.length}件
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowTagList(false)}
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${activeTheme.textMuted} hover:${activeTheme.textMain} hover:${activeTheme.tagBg}`}
                title="閉じる"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-header with search & actions */}
            <div className={`p-4 border-b shrink-0 space-y-3 ${activeTheme.border}`}>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="タグ名で絞り込む..."
                  value={tagSearchQuery}
                  onChange={(e) => setTagSearchQuery(e.target.value)}
                  className={`w-full px-3 pl-9 pr-8 py-2 rounded-lg text-xs focus:outline-none transition-all font-sans ${activeTheme.inputBg} border ${activeTheme.border} ${activeTheme.textMain}`}
                />
                {tagSearchQuery && (
                  <button
                    onClick={() => setTagSearchQuery("")}
                    className="absolute right-3 top-2 w-5 h-5 flex items-center justify-center text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="絞り込みをクリア"
                  >
                    ×
                  </button>
                )}
              </div>
              
              <div className="flex items-center justify-between text-[11px]">
                <span className={activeTheme.textMuted}>
                  タグ選択で検索窓に反映（複数選択可）
                </span>
                {search.trim() && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-red-500 hover:text-red-600 font-semibold cursor-pointer flex items-center gap-0.5 transition-colors"
                  >
                    検索をクリア
                  </button>
                )}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 min-h-0">
              {filteredTagsInModal.length === 0 ? (
                <div className={`text-center py-10 ${activeTheme.textMuted}`}>
                  <Hash className="w-8 h-8 mx-auto opacity-30 mb-2" />
                  <p className="text-xs">
                    {tagSearchQuery ? "一致するタグがありません" : "タグが登録されていません"}
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {filteredTagsInModal.map((t) => {
                    const active = isTagActive(t.display);
                    return (
                      <button
                        key={t.display}
                        onClick={() => handleTagClick(t.display)}
                        className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-1.5 cursor-pointer font-sans transition-all active:scale-95 shadow-sm ${
                          active
                            ? `${activeTheme.accentBg} text-white border-transparent`
                            : `${activeTheme.tagBg} ${activeTheme.tagText} ${activeTheme.border} hover:border-indigo-500/40 hover:bg-indigo-500/5`
                        }`}
                      >
                        <Hash className={`w-3 h-3 ${active ? 'text-white' : 'opacity-60'}`} />
                        <span className="font-medium">{t.display}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                          active 
                            ? 'bg-white/20 text-white' 
                            : 'bg-black/5 dark:bg-white/10 opacity-70'
                        }`}>
                          {t.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={`px-6 py-4 border-t flex justify-end gap-2 shrink-0 ${activeTheme.sidebarBg} ${activeTheme.border}`}>
              <button
                onClick={() => setShowTagList(false)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer shadow-sm transition-all text-white ${activeTheme.accentBg} ${activeTheme.accentBgHover}`}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
