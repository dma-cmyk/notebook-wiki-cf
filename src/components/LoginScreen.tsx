/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import { Key, UserPlus, RefreshCw, LogIn, Clipboard, Check, Lock, ShieldCheck } from "lucide-react";

interface LoginScreenProps {
  onLoginSuccess: (token: string, user: { id: string; username: string; apiKey: string }) => void;
}

interface RegisteredUser {
  id: string;
  username: string;
}

export function LoginScreen({ onLoginSuccess }: LoginScreenProps) {
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [passphrase, setPassphrase] = useState<string>("");
  const [totpCode, setTotpCode] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Registration State
  const [isRegisterMode, setIsRegisterMode] = useState<boolean>(false);
  const [newUsername, setNewUsername] = useState<string>("");
  const [newPassphrase, setNewPassphrase] = useState<string>("");
  const [regResult, setRegResult] = useState<{
    totpSecret: string;
    otpauthUrl: string;
    apiKey: string;
    user: { id: string; username: string; apiKey: string };
    token: string;
  } | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedSecret, setCopiedSecret] = useState<boolean>(false);

  // Fetch users on load
  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/auth/users");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Generate QR Code once regResult is set
  useEffect(() => {
    if (regResult?.otpauthUrl) {
      QRCode.toDataURL(regResult.otpauthUrl, { width: 220, margin: 1 })
        .then((url) => setQrCodeDataUrl(url))
        .catch((err) => console.error("Failed to generate QR Code:", err));
    }
  }, [regResult]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !passphrase || !totpCode) {
      setError("すべての項目を入力してください。");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: selectedUser,
          passphrase,
          totpCode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ログインに失敗しました。");
      }

      onLoginSuccess(data.token, data.user);
    } catch (err: any) {
      setError(err.message || "接続に失敗しました。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassphrase) {
      setError("ユーザー名とパスフレーズを入力してください。");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          passphrase: newPassphrase,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "登録に失敗しました。");
      }

      setRegResult(data);
    } catch (err: any) {
      setError(err.message || "登録中にエラーが発生しました。");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteRegistration = () => {
    if (regResult) {
      onLoginSuccess(regResult.token, regResult.user);
    }
  };

  const copyToClipboard = (text: string, type: "key" | "secret") => {
    navigator.clipboard.writeText(text);
    if (type === "key") {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFDFD] flex flex-col items-center justify-center p-6 select-none text-slate-800">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
        {/* Header Branding */}
        <div className="bg-white border-b border-slate-200 px-6 py-8 text-center relative">
          <div className="absolute top-4 left-4 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-full px-2.5 py-0.5 text-[10px] font-mono tracking-wider font-semibold">
            SECURE ACCESS
          </div>
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-150 text-indigo-600 mb-3 mt-2">
            <Lock className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-slate-950">LLM Wiki</h1>
          <p className="text-xs text-slate-400 mt-1 font-mono">End-to-End Encrypted Personal Knowledge Base</p>
        </div>

        {/* Dynamic Inner Body */}
        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3.5 mb-5 font-semibold leading-relaxed">
              {error}
            </div>
          )}

          {/* REGISTRATION STEP 2: TOTP Verification / QR Code Scan */}
          {regResult ? (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 mb-2">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h2 className="text-base font-display font-semibold text-slate-800">2要素認証の設定</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Google Authenticator等の認証アプリで下記のQRコードをスキャンしてください。
                </p>
              </div>

              {/* QR Image Frame */}
              <div className="flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded-xl p-4">
                {qrCodeDataUrl ? (
                  <img src={qrCodeDataUrl} alt="TOTP Setup QR Code" className="w-48 h-48 border border-slate-200 rounded-lg bg-white" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center">
                    <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
                  </div>
                )}
                <div className="mt-3 flex items-center gap-1.5 text-[10px] font-mono bg-white border border-slate-200 px-2.5 py-1 rounded text-slate-600 max-w-full overflow-hidden">
                  <span className="truncate">鍵: {regResult.totpSecret}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(regResult.totpSecret, "secret")}
                    className="text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
                  >
                    {copiedSecret ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Clipboard className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* API Key Display */}
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-slate-800">外部連携用 API Key</p>
                <div className="text-[10px] text-slate-500 space-y-1 leading-normal">
                  <p>外部アプリや独自スクリプトから自動でメモを登録する際に必要となるAPIキーです。</p>
                  <p className="font-semibold text-indigo-700">HTTPヘッダーへの付与例:</p>
                  <div className="bg-slate-50 border border-slate-150 rounded px-2 py-1 font-mono text-[9px] text-slate-600">
                    X-API-KEY: (下記キーをセット)
                  </div>
                </div>
                <div className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-2.5 mt-2 overflow-hidden">
                  <span className="font-mono text-xs text-slate-700 truncate select-all">{regResult.user.apiKey}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(regResult.user.apiKey, "key")}
                    className="text-indigo-600 hover:text-indigo-700 ml-2 cursor-pointer flex-shrink-0"
                    title="APIキーをコピー"
                  >
                    {copiedKey ? <Check className="w-4 h-4 text-emerald-600" /> : <Clipboard className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCompleteRegistration}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors cursor-pointer shadow-sm"
              >
                認証を完了してログイン
              </button>
            </div>
          ) : isRegisterMode ? (
            /* USER REGISTRATION FORM */
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">ワークスペース名（ユーザー名）</label>
                <input
                  type="text"
                  placeholder="e.g. workspace_alice"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.trim())}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">暗号化パスフレーズ</label>
                <input
                  type="password"
                  placeholder="強力なパスフレーズを入力..."
                  value={newPassphrase}
                  onChange={(e) => setNewPassphrase(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                />
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  ※メモを強力に暗号化するための秘密のパスワードです。サーバーにはハッシュ化された状態で保存され、このパスフレーズがないと誰も復号できません。
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    新規登録
                  </>
                )}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRegisterMode(false);
                    setError("");
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
                >
                  すでにアカウントをお持ちですか？ ログインへ
                </button>
              </div>
            </form>
          ) : (
            /* SECURE USER LOGIN FORM */
            <form onSubmit={handleLogin} className="space-y-4">
              {users.length > 0 ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">ワークスペース名（ユーザー名）</label>
                  <input
                    type="text"
                    placeholder="登録したワークスペース名を入力"
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value.trim())}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                    autoComplete="username"
                  />
                </div>
              ) : (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center space-y-2 mb-2">
                  <p className="text-xs text-indigo-800 font-semibold">登録されているユーザーがいません。</p>
                  <button
                    type="button"
                    onClick={() => setIsRegisterMode(true)}
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 shadow-sm"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    最初のユーザーを登録
                  </button>
                </div>
              )}

              {users.length > 0 && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">パスフレーズ</label>
                    <input
                      type="password"
                      placeholder="暗号化パスフレーズを入力..."
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-slate-700">認証コード (TOTP)</label>
                      <span className="text-[10px] text-slate-400 font-mono">6-Digit Code</span>
                    </div>
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="e.g. 123456"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.trim().replace(/\D/g, ""))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm tracking-[0.25em] text-center font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="text-[9px] text-slate-400 mt-1 leading-normal">
                      ※スキャン済みの認証アプリに表示される現在の認証コードを入力してください。
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <LogIn className="w-4 h-4" />
                        認証して復号ログイン
                      </>
                    )}
                  </button>

                  <div className="text-center pt-2 border-t border-slate-100 mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRegisterMode(true);
                        setRegResult(null);
                        setError("");
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      新規ユーザー登録はこちら
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
