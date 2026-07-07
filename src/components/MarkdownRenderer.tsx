/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ThemePreset } from "../App";

interface MarkdownRendererProps {
  content: string;
  onLinkClick?: (memoId: string) => void;
  allMemos?: { id: string; title: string }[];
  activeTheme?: ThemePreset;
  token?: string;
}

export function MarkdownRenderer({ content, onLinkClick, allMemos = [], activeTheme, token }: MarkdownRendererProps) {
  const isDark = activeTheme?.isDark ?? false;

  if (!content) return <p className={isDark ? "text-slate-400 italic" : "text-gray-400 italic"}>本文がありません。</p>;

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];

  let inList = false;
  let listItems: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${key}`} className={`list-disc pl-6 mb-4 space-y-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
          {listItems.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: parseInlineMarkdown(item) }} />
          ))}
        </ul>
      );
      listItems = [];
    }
    inList = false;
  };

  const flushCodeBlock = (key: string) => {
    if (codeLines.length > 0) {
      elements.push(
        <pre key={`code-${key}`} className={`border rounded p-4 mb-4 font-mono text-xs overflow-x-auto ${isDark ? "bg-slate-900 border-slate-800 text-slate-200" : "bg-gray-50 border-gray-200 text-gray-800"}`}>
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      codeLines = [];
    }
    inCodeBlock = false;
  };

  // Inline markdown parser (bold, italic, inline code, links)
  const parseInlineMarkdown = (text: string): string => {
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Bold (**text** or __text__)
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__(.*?)__/g, "<strong>$1</strong>");

    // Italic (*text* or _text_)
    html = html.replace(/\*(.*?)\*/g, "<em>$1</em>");
    html = html.replace(/_(.*?)_/g, "<em>$1</em>");

    // Inline code (`code`)
    const inlineCodeClass = isDark
      ? "bg-slate-800 font-mono text-xs px-1.5 py-0.5 rounded text-pink-400"
      : "bg-gray-100 font-mono text-xs px-1.5 py-0.5 rounded text-red-600";
    html = html.replace(/`(.*?)`/g, `<code class='${inlineCodeClass}'>$1</code>`);

    // Markdown Links [Label](URL)
    const linkClass = isDark
      ? "text-indigo-400 hover:underline font-medium"
      : "text-indigo-600 hover:underline font-medium";

    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (match, label, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="${linkClass}">${label}</a>`;
    });

    // Bare URLs (http:// or https://)
    html = html.replace(/(?<!["'=\w])(https?:\/\/[^\s<"'\)]+)/g, (match, url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="${linkClass}">${url}</a>`;
    });

    return html;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block toggle
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        flushCodeBlock(`cb-${i}`);
      } else {
        if (inList) flushList(`list-${i}`);
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Header 1
    if (line.startsWith("# ")) {
      if (inList) flushList(`list-${i}`);
      elements.push(
        <h1 key={i} className={`text-2xl font-display font-semibold border-b pb-2 mt-6 mb-4 ${isDark ? "text-slate-100 border-slate-800" : "text-gray-900 border-gray-100"}`}>
          {line.substring(2)}
        </h1>
      );
      continue;
    }

    // Header 2
    if (line.startsWith("## ")) {
      if (inList) flushList(`list-${i}`);
      elements.push(
        <h2 key={i} className={`text-xl font-display font-semibold mt-5 mb-3 ${isDark ? "text-slate-100" : "text-gray-800"}`}>
          {line.substring(3)}
        </h2>
      );
      continue;
    }

    // Header 3
    if (line.startsWith("### ")) {
      if (inList) flushList(`list-${i}`);
      elements.push(
        <h3 key={i} className={`text-lg font-display font-medium mt-4 mb-2 ${isDark ? "text-slate-200" : "text-gray-800"}`}>
          {line.substring(4)}
        </h3>
      );
      continue;
    }

    // Horizontal Rule
    if (line.trim() === "---") {
      if (inList) flushList(`list-${i}`);
      elements.push(<hr key={i} className={`my-6 ${isDark ? "border-slate-800" : "border-gray-200"}`} />);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      if (inList) flushList(`list-${i}`);
      elements.push(
        <blockquote key={i} className={`border-l-4 pl-4 italic mb-4 my-2 ${isDark ? "border-slate-700 text-slate-400" : "border-gray-300 text-gray-600"}`}>
          {line.substring(2)}
        </blockquote>
      );
      continue;
    }

    // Unordered List Item
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      inList = true;
      listItems.push(line.trim().substring(2));
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      if (inList) flushList(`list-${i}`);
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    // Multimedia match: ![Description](URL)
    const mediaMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (mediaMatch) {
      if (inList) flushList(`list-${i}`);
      const alt = mediaMatch[1];
      const url = mediaMatch[2];
      const lowerUrl = url.toLowerCase();
      const lowerAlt = alt.toLowerCase();

      let mediaType: "image" | "audio" | "video" | "unknown" = "unknown";
      if (
        lowerUrl.endsWith(".png") ||
        lowerUrl.endsWith(".jpg") ||
        lowerUrl.endsWith(".jpeg") ||
        lowerUrl.endsWith(".gif") ||
        lowerUrl.endsWith(".webp") ||
        lowerUrl.endsWith(".bmp") ||
        lowerUrl.startsWith("data:image/") ||
        lowerAlt.includes("image") ||
        lowerAlt.includes("画像") ||
        lowerAlt.includes("写真")
      ) {
        mediaType = "image";
      } else if (
        lowerUrl.endsWith(".mp3") ||
        lowerUrl.endsWith(".wav") ||
        lowerUrl.endsWith(".m4a") ||
        lowerUrl.endsWith(".ogg") ||
        lowerUrl.endsWith(".aac") ||
        lowerUrl.startsWith("data:audio/") ||
        lowerAlt.includes("audio") ||
        lowerAlt.includes("音声") ||
        lowerAlt.includes("録音") ||
        lowerAlt.includes("ボイス")
      ) {
        mediaType = "audio";
      } else if (
        lowerUrl.endsWith(".mp4") ||
        lowerUrl.endsWith(".webm") ||
        lowerUrl.endsWith(".ogg") ||
        lowerUrl.endsWith(".mov") ||
        lowerUrl.startsWith("data:video/") ||
        lowerAlt.includes("video") ||
        lowerAlt.includes("動画") ||
        lowerAlt.includes("映像")
      ) {
        mediaType = "video";
      }

      // Append session token to secure media URLs so the browser can load them
      const displayUrl = (url.startsWith("/api/uploads/") && token) 
        ? `${url}?token=${encodeURIComponent(token)}` 
        : url;

      if (mediaType === "image") {
        elements.push(
          <div key={i} className="mb-4 group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs transition-all hover:shadow-md bg-slate-50 dark:bg-slate-900/40 p-1 max-w-lg">
            <img
              src={displayUrl}
              alt={alt || "画像"}
              className="w-full max-h-[350px] object-contain rounded-lg bg-black cursor-zoom-in transition-transform duration-300 group-hover:scale-[1.005]"
              referrerPolicy="no-referrer"
              onClick={() => {
                window.open(displayUrl, "_blank");
              }}
            />
            {alt && (
              <div className="px-2.5 py-1 text-[11px] text-slate-500 dark:text-slate-400 font-sans truncate">
                📷 {alt}
              </div>
            )}
          </div>
        );
        continue;
      } else if (mediaType === "audio") {
        elements.push(
          <div key={i} className={`p-4 mb-4 rounded-xl border flex flex-col gap-2 shadow-xs max-w-md ${isDark ? "bg-slate-900/60 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-200 text-slate-800"}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${isDark ? "bg-slate-800 text-indigo-400" : "bg-white text-indigo-600"} border dark:border-slate-700 shadow-xs`}>
                <svg className="w-4 h-4 text-indigo-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M12 18.75V5.25L7.72 9.53H4.5a.75.75 0 00-.75.75v3.44c0 .414.336.75.75.75h3.22L12 18.75z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate">{alt || "音声プレイヤー"}</p>
                <p className="text-[10px] text-slate-400 font-mono">Audio Clip</p>
              </div>
            </div>
            <audio src={displayUrl} controls className="w-full h-8 outline-none mt-1" />
          </div>
        );
        continue;
      } else if (mediaType === "video") {
        elements.push(
          <div key={i} className="mb-4 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xs bg-black max-w-lg">
            <video src={displayUrl} controls className="w-full max-h-[300px]" />
            {alt && (
              <div className="px-3 py-1.5 text-xs text-slate-400 bg-slate-900/90 border-t border-slate-800 truncate">
                🎥 {alt}
              </div>
            )}
          </div>
        );
        continue;
      }
    }

    // Standard paragraph
    if (inList) flushList(`list-${i}`);

    // Parse links explicitly to render clickable buttons
    const parsedLine = parseInlineMarkdown(line);
    elements.push(
      <p
        key={i}
        className={`leading-relaxed mb-4 text-sm ${isDark ? "text-slate-300" : "text-gray-700"}`}
        dangerouslySetInnerHTML={{ __html: parsedLine }}
      />
    );
  }

  // Flush any remaining active lists or code blocks
  if (inList) flushList("end");
  if (inCodeBlock) flushCodeBlock("end");

  // Render clickable connections separately if they exist in the text as wikilinks (e.g. [[Note Title]])
  return <div className={`max-w-none ${isDark ? "text-slate-300" : "text-slate-800"}`}>{elements}</div>;
}
