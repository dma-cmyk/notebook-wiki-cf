/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import crypto from "crypto";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import { env } from "cloudflare:workers";
import { httpServerHandler } from "cloudflare:node";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3200;

// In-memory cache for DB
let dbCache: any = null;

// Write queue to guarantee ordered KV write operations
let writeQueue: Promise<void> = Promise.resolve();

// Middleware to pre-load dbCache from Workers KV before handling routes
app.use(async (req: any, res: any, next: any) => {
  if (!dbCache) {
    try {
      if (env.NOTEBOOK_WIKI_KV) {
        const data = await env.NOTEBOOK_WIKI_KV.get("db_json");
        if (data) {
          dbCache = JSON.parse(data);
        } else {
          dbCache = { users: [], memos: [] };
          await env.NOTEBOOK_WIKI_KV.put("db_json", JSON.stringify(dbCache));
        }
      } else {
        dbCache = { users: [], memos: [] };
      }
    } catch (err) {
      console.error("Failed to load DB from KV:", err);
      dbCache = { users: [], memos: [] };
    }
  }
  next();
});



// In-memory sessions map: token -> user's decrypted 32-byte master key (Buffer)
const activeSessions = new Map<string, { userId: string; username: string; masterKey: Buffer }>();

// Read DB helper (returns memory cache synchronously)
function readDB() {
  if (!dbCache) {
    return { users: [], memos: [] };
  }
  return dbCache;
}

// Write DB helper (updates cache and schedules non-blocking KV save)
function writeDB(data: any) {
  dbCache = data;
  writeQueue = writeQueue.then(async () => {
    try {
      if (env.NOTEBOOK_WIKI_KV) {
        await env.NOTEBOOK_WIKI_KV.put("db_json", JSON.stringify(data));
      } else {
        console.warn("NOTEBOOK_WIKI_KV binding not available during write");
      }
    } catch (err) {
      console.error("Failed to sync DB to KV:", err);
    }
  });
}

// Encryption helpers
function deriveKey(secret: string, salt: Buffer): Buffer {
  // Derive a 32-byte key using scrypt
  return crypto.scryptSync(secret, salt, 32);
}

function encrypt(text: string, key: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(cipherText: string, key: Buffer): string {
  const parts = cipherText.split(":");
  const iv = Buffer.from(parts.shift() || "", "hex");
  const encryptedText = Buffer.from(parts.join(":"), "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  let decrypted = decipher.update(encryptedText, undefined, "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function encryptBuffer(buffer: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return Buffer.concat([iv, encrypted]);
}

function decryptBuffer(encryptedBuffer: Buffer, key: Buffer): Buffer {
  const iv = encryptedBuffer.subarray(0, 16);
  const encryptedData = encryptedBuffer.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]);
}

// AIのAPIキーをDBから復号して取得するヘルパー
// 旧データ（平文）のマイグレーション互換: decrypt失敗時はフォールバックで平文値を返す
function getUserAiApiKey(user: any, masterKey?: Buffer): string {
  if (!user?.aiApiKey) return "";
  if (!masterKey) return "";
  try {
    return decrypt(user.aiApiKey, masterKey);
  } catch {
    // マイグレーション: 旧データが平文の場合はそのまま返す
    return user.aiApiKey;
  }
}

// TOTP verification helpers
function decodeBase32(base32: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  base32 = base32.toUpperCase().replace(/=+$/, "");
  let length = base32.length;
  let bits = 0;
  let value = 0;
  let index = 0;
  const buffer = Buffer.alloc(Math.floor((length * 5) / 8));

  for (let i = 0; i < length; i++) {
    const val = alphabet.indexOf(base32[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      buffer[index++] = (value >> (bits - 8)) & 255;
      bits -= 8;
    }
  }
  return buffer;
}

function verifyTOTP(secret: string, code: string): boolean {
  try {
    const key = decodeBase32(secret);
    const now = Math.floor(Date.now() / 1000);
    const step = 30;

    // Standard verification window of +/- 1 steps (30s drift)
    for (let i = -1; i <= 1; i++) {
      const counter = Math.floor(now / step) + i;
      const buffer = Buffer.alloc(8);
      buffer.writeUInt32BE(0, 0);
      buffer.writeUInt32BE(counter, 4);

      const hmac = crypto.createHmac("sha1", key);
      hmac.update(buffer);
      const hmacResult = hmac.digest();

      const offset = hmacResult[hmacResult.length - 1] & 0xf;
      const binCode = ((hmacResult[offset] & 0x7f) << 24) |
                      ((hmacResult[offset + 1] & 0xff) << 16) |
                      ((hmacResult[offset + 2] & 0xff) << 8) |
                      (hmacResult[offset + 3] & 0xff);

      const otp = (binCode % 1000000).toString().padStart(6, "0");
      if (otp === code) {
        return true;
      }
    }
  } catch (err) {
    console.error("Error in verifyTOTP:", err);
  }
  return false;
}

// Gemini Client setup
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "dummy",
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Helper function to handle Gemini API generateContent calls with retries and fallback models
async function safeGenerateContent(
  userAi: any,
  params: { model: string; contents: any; config?: any },
  retries = 3,
  delay = 1000
): Promise<any> {
  let attempt = 0;
  let originalModel = params.model;
  while (true) {
    try {
      return await userAi.models.generateContent(params);
    } catch (err: any) {
      attempt++;
      const errMsg = err?.message || String(err);
      const isRateLimitOrUnavailable =
        err?.status === "UNAVAILABLE" ||
        err?.status === "RESOURCE_EXHAUSTED" ||
        err?.statusCode === 503 ||
        err?.statusCode === 429 ||
        errMsg.includes("503") ||
        errMsg.includes("429") ||
        errMsg.includes("high demand") ||
        errMsg.includes("limit") ||
        errMsg.includes("UNAVAILABLE") ||
        errMsg.includes("Resource exhausted");

      if (isRateLimitOrUnavailable && attempt <= retries) {
        const actualDelay = delay * Math.pow(2, attempt - 1);
        console.warn(`Gemini API call failed with temporary error (attempt ${attempt}/${retries}). Retrying in ${actualDelay}ms...`, errMsg);
        await new Promise((resolve) => setTimeout(resolve, actualDelay));
        continue;
      }

      // Fallback model sequence if we're seeing persistent errors
      const fallbackModels = ["gemini-3.1-flash-lite", "gemini-flash-latest"];
      const currentModelIndex = fallbackModels.indexOf(params.model);
      if (currentModelIndex === -1 && params.model === "gemini-3.5-flash" && attempt <= retries + 1) {
        const nextModel = fallbackModels[0];
        console.warn(`Persistent error on ${params.model}. Falling back to ${nextModel}...`, errMsg);
        params.model = nextModel;
        attempt = 0; // reset attempts for the fallback model
        continue;
      } else if (currentModelIndex !== -1 && currentModelIndex < fallbackModels.length - 1 && attempt <= retries + 1) {
        const nextModel = fallbackModels[currentModelIndex + 1];
        console.warn(`Persistent error on ${params.model}. Falling back to next model ${nextModel}...`, errMsg);
        params.model = nextModel;
        attempt = 0;
        continue;
      }

      throw err;
    }
  }
}

// Middleware for parsing json and static files
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Auth middleware
function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing session token" });
  }
  const token = authHeader.split(" ")[1];
  const session = activeSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized: Session expired or invalid" });
  }
  req.session = session;
  next();
}

// 1. Auth Endpoint: Register User
app.post("/api/auth/register", (req, res) => {
  const { username, passphrase } = req.body;
  if (!username || !passphrase) {
    return res.status(400).json({ error: "Username and passphrase are required" });
  }

  const db = readDB();
  const existingUser = db.users.find((u: any) => u.username.toLowerCase() === username.toLowerCase());
  if (existingUser) {
    return res.status(400).json({ error: "User already exists" });
  }

  const userId = crypto.randomUUID();
  const totpSecret = crypto.randomBytes(10).toString("hex").toUpperCase(); // Simple key, formatted as base32
  // We make it base32 compatible using standard A-Z, 2-7
  const base32Secret = Array.from(totpSecret)
    .map(c => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[parseInt(c, 16) % 32])
    .join("");

  const apiKey = "api_key_" + crypto.randomBytes(16).toString("hex");
  const salt = crypto.randomBytes(16);
  const masterKey = crypto.randomBytes(32);

  // Encrypt master key using passphrase
  const passDerivedKey = deriveKey(passphrase, salt);
  const encryptedMasterKeyPass = encrypt(masterKey.toString("hex"), passDerivedKey);

  // Encrypt master key using API Key
  const apiDerivedKey = deriveKey(apiKey, salt);
  const encryptedMasterKeyApi = encrypt(masterKey.toString("hex"), apiDerivedKey);

  const newUser = {
    id: userId,
    username,
    totpSecret: base32Secret,
    apiKey,
    saltHex: salt.toString("hex"),
    encryptedMasterKeyPass,
    encryptedMasterKeyApi,
    createdAt: new Date().toISOString(),
  };

  db.users.push(newUser);
  writeDB(db);

  // Create session
  const token = crypto.randomBytes(32).toString("hex");
  activeSessions.set(token, { userId, username, masterKey });

  // Generate TOTP QR URI
  const otpauthUrl = `otpauth://totp/LLMWiki:${username}?secret=${base32Secret}&issuer=LLMWiki`;

  res.json({
    user: {
      id: userId,
      username,
      apiKey,
    },
    totpSecret: base32Secret,
    otpauthUrl,
    token,
  });
});

// 2. Auth Endpoint: Login User
app.post("/api/auth/login", (req, res) => {
  const { username, passphrase, totpCode } = req.body;
  if (!username || !passphrase || !totpCode) {
    return res.status(400).json({ error: "Username, passphrase, and TOTP code are required" });
  }

  const db = readDB();
  const user = db.users.find((u: any) => u.username.toLowerCase() === username.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  // Verify TOTP
  const isTotpValid = verifyTOTP(user.totpSecret, totpCode);
  if (!isTotpValid) {
    return res.status(401).json({ error: "Invalid TOTP verification code" });
  }

  // Decrypt master key using passphrase
  try {
    const salt = Buffer.from(user.saltHex, "hex");
    const passDerivedKey = deriveKey(passphrase, salt);
    const decryptedHex = decrypt(user.encryptedMasterKeyPass, passDerivedKey);
    const masterKey = Buffer.from(decryptedHex, "hex");

    const token = crypto.randomBytes(32).toString("hex");
    activeSessions.set(token, { userId: user.id, username: user.username, masterKey });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        apiKey: user.apiKey,
      },
      token,
    });
  } catch (err) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
});

// 3. Auth Endpoint: Get Users List (For simple login selector)
app.get("/api/auth/users", (req, res) => {
  const db = readDB();
  const users = db.users.map((u: any) => ({ id: u.id, username: u.username }));
  res.json(users);
});

// 4. Auth Endpoint: Logout
app.post("/api/auth/logout", (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    activeSessions.delete(token);
  }
  res.json({ success: true });
});

// 5. User Settings Endpoint: Get Settings
app.get("/api/settings", requireAuth, (req: any, res: any) => {
  const db = readDB();
  const user = db.users.find((u: any) => u.id === req.session.userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({
    aiProvider: user.aiProvider || "gemini",
    aiApiKey: getUserAiApiKey(user, req.session.masterKey),
    aiEndpoint: user.aiEndpoint || "https://api.openai.com/v1",
    aiModel: user.aiModel || "gemini-3.5-flash",
    theme: user.theme || "slate-light",
  });
});

// 6. User Settings Endpoint: Save Settings
app.post("/api/settings", requireAuth, (req: any, res: any) => {
  const { aiProvider, aiApiKey, aiEndpoint, aiModel, theme } = req.body;
  const db = readDB();
  const user = db.users.find((u: any) => u.id === req.session.userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  if (aiProvider !== undefined) user.aiProvider = aiProvider;
  if (aiApiKey !== undefined) user.aiApiKey = aiApiKey ? encrypt(aiApiKey, req.session.masterKey) : "";
  if (aiEndpoint !== undefined) user.aiEndpoint = aiEndpoint;
  if (aiModel !== undefined) user.aiModel = aiModel;
  if (theme !== undefined) user.theme = theme;
  
  writeDB(db);
  res.json({
    success: true,
    settings: {
      aiProvider: user.aiProvider,
      aiApiKey: getUserAiApiKey(user, req.session.masterKey),
      aiEndpoint: user.aiEndpoint,
      aiModel: user.aiModel,
      theme: user.theme || "slate-light",
    }
  });
});

// User Settings Endpoint: Change Password/Passphrase
app.post("/api/settings/change-password", requireAuth, (req: any, res: any) => {
  const { currentPassphrase, newPassphrase, totpCode } = req.body;
  if (!currentPassphrase || !newPassphrase || !totpCode) {
    return res.status(400).json({ error: "現在のパスワード、新しいパスワード、およびTOTP認証コードが必要です。" });
  }

  const db = readDB();
  const user = db.users.find((u: any) => u.id === req.session.userId);
  if (!user) {
    return res.status(404).json({ error: "ユーザーが見つかりませんでした。" });
  }

  // Verify TOTP code
  const isTotpValid = verifyTOTP(user.totpSecret, totpCode);
  if (!isTotpValid) {
    return res.status(401).json({ error: "TOTP認証コード（ワンタイムパスワード）が正しくありません。" });
  }

  try {
    // 1. Verify current passphrase by trying to decrypt master key
    const salt = Buffer.from(user.saltHex, "hex");
    const currentPassDerivedKey = deriveKey(currentPassphrase, salt);
    const decryptedHex = decrypt(user.encryptedMasterKeyPass, currentPassDerivedKey);
    const masterKey = Buffer.from(decryptedHex, "hex");

    // 2. Generate a new salt for added security, and derive new key
    const newSalt = crypto.randomBytes(16);
    const newPassDerivedKey = deriveKey(newPassphrase, newSalt);
    const newEncryptedMasterKeyPass = encrypt(masterKey.toString("hex"), newPassDerivedKey);

    // 3. Update database
    user.saltHex = newSalt.toString("hex");
    user.encryptedMasterKeyPass = newEncryptedMasterKeyPass;
    
    // 4. Update the active session key (though the masterKey remains the same)
    req.session.masterKey = masterKey;

    writeDB(db);
    res.json({ success: true, message: "パスワードが正常に変更されました。" });
  } catch (err) {
    return res.status(401).json({ error: "現在のパスワードが正しくありません。" });
  }
});

// User Settings Endpoint: Delete Account
app.post("/api/settings/delete-account", requireAuth, (req: any, res: any) => {
  const { passphrase, totpCode } = req.body;
  if (!passphrase || !totpCode) {
    return res.status(400).json({ error: "パスワードとTOTP認証コードを入力してください。" });
  }

  const db = readDB();
  const user = db.users.find((u: any) => u.id === req.session.userId);
  if (!user) {
    return res.status(404).json({ error: "ユーザーが見つかりませんでした。" });
  }

  // Verify TOTP code
  const isTotpValid = verifyTOTP(user.totpSecret, totpCode);
  if (!isTotpValid) {
    return res.status(401).json({ error: "TOTP認証コード（ワンタイムパスワード）が正しくありません。" });
  }

  try {
    // Verify passphrase by trying to decrypt master key
    const salt = Buffer.from(user.saltHex, "hex");
    const passDerivedKey = deriveKey(passphrase, salt);
    decrypt(user.encryptedMasterKeyPass, passDerivedKey);

    // Password is valid! Proceed to delete all memos for this user
    db.memos = db.memos.filter((m: any) => m.userId !== user.id);

    // Delete user from db
    db.users = db.users.filter((u: any) => u.id !== user.id);

    writeDB(db);

    // Revoke all active sessions for this user
    for (const [token, session] of activeSessions.entries()) {
      if (session.userId === user.id) {
        activeSessions.delete(token);
      }
    }

    res.json({ success: true, message: "アカウントが正常に削除されました。" });
  } catch (err) {
    return res.status(401).json({ error: "パスワードが正しくありません。" });
  }
});

// 7. User Settings Endpoint: Fetch Models dynamically
app.post("/api/settings/fetch-models", requireAuth, async (req: any, res: any) => {
  const { aiProvider, aiApiKey, aiEndpoint } = req.body;
  if (!aiProvider) {
    return res.status(400).json({ error: "aiProvider is required" });
  }

  try {
    if (aiProvider === "gemini") {
      const key = aiApiKey || process.env.GEMINI_API_KEY;
      if (!key) {
        return res.json({ models: ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash"] });
      }
      
      try {
        const fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
        const response = await fetch(fetchUrl);
        if (response.ok) {
          const data = await response.json();
          const models = (data.models || [])
            .map((m: any) => m.name.replace("models/", ""))
            .filter((name: string) => name.startsWith("gemini-") || name.startsWith("learnlm-"));
          if (models.length > 0) {
            return res.json({ models });
          }
        }
      } catch (err) {
        console.warn("Failed to fetch models dynamically from Gemini API, falling back to defaults:", err);
      }
      
      return res.json({
        models: [
          "gemini-3.5-flash",
          "gemini-2.5-flash",
          "gemini-2.5-pro",
          "gemini-1.5-flash",
          "gemini-1.5-pro"
        ]
      });

    } else if (aiProvider === "openai-compatible") {
      const key = aiApiKey;
      const baseUrl = (aiEndpoint || "https://api.openai.com/v1").trim().replace(/\/+$/, "");
      
      if (!key) {
        return res.status(400).json({ error: "OpenAI-compatible API requires an API key" });
      }

      let modelsUrl = baseUrl.endsWith("/v1") ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
      let lastErrMessage = "";

      for (const urlToTry of [modelsUrl, `${baseUrl}/models`, `${baseUrl}/v1/models`]) {
        try {
          const response = await fetch(urlToTry, {
            headers: {
              "Authorization": `Bearer ${key}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            const models = (data.data || [])
              .map((m: any) => m.id)
              .filter((id: string) => id);
            if (models.length > 0) {
              return res.json({ models });
            }
          } else {
            const txt = await response.text();
            lastErrMessage = `Status ${response.status}: ${txt}`;
          }
        } catch (err: any) {
          lastErrMessage = err.message || String(err);
        }
      }

      return res.status(400).json({ error: `Failed to fetch models from endpoint: ${lastErrMessage}` });
    }

    res.status(400).json({ error: "Invalid provider" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch models" });
  }
});

// Helper sleep function for backoff
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Robust JSON response parser
function parseResponseText(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/```(?:json)?([\s\S]*?)```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {}
    }
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {}
    }
    throw new Error("Could not parse JSON from model response text");
  }
}

// Dynamic metadata generator logic supporting Gemini and OpenAI-compatible endpoints
async function generateMemoMetadata(
  title: string,
  content: string,
  userId: string,
  currentMemoId: string,
  existingMemos: any[],
  masterKey?: Buffer
): Promise<{ tags: string[]; relatedMemoIds: string[]; summary: string }> {
  const db = readDB();
  const user = db.users.find((u: any) => u.id === userId);
  const provider = user?.aiProvider || "gemini";
  const apiKey = getUserAiApiKey(user, masterKey) || process.env.GEMINI_API_KEY || "dummy";
  const endpoint = user?.aiEndpoint || "https://api.openai.com/v1";
  const model = user?.aiModel || "gemini-3.5-flash";

  try {
    // Standard prompt to analyze note content and find related ones
    const memosListText = existingMemos
      .filter((m: any) => m.id !== currentMemoId)
      .map((m: any) => `ID: "${m.id}", Title: "${m.title}", Tags: [${(m.tags || []).join(", ")}]`)
      .join("\n");

    const prompt = `Analyze this memo:
Title: "${title}"
Content: "${content}"

Generate exactly 5 relevant tags/keywords for this memo following these guidelines:
1. Tag Consolidation: Automatically consolidate/merge any tags that are semantically highly similar, synonymous, or better unified under a single representative tag (e.g., grouping spelling variations, or closely overlapping concepts like "お笑い" and "ジョーク" into one tag).
2. Tag Replenishment: If the consolidation (or any other factor) results in fewer than 5 tags, you MUST generate additional unique, contextually relevant, and distinct tags for this memo so that the final list contains exactly 5 tags.
3. The "tags" array MUST have exactly 5 elements.

Also, select the top 3 most relevant related memos to connect to from this existing list:
${memosListText || "(None available)"}

Provide a concise 1-2 sentence summary of the memo content in Japanese.

Return only the JSON containing "tags" (string array of exactly 5 elements), "relatedMemoIds" (string array of matching IDs), and "summary" (a concise 1-2 sentence Japanese summary string).`;

    let attempts = 0;
    const maxAttempts = 3;
    let resultText = "";
    
    while (attempts < maxAttempts) {
      try {
        if (provider === "gemini") {
          let userAi = ai;
          if (getUserAiApiKey(user, masterKey)) {
            userAi = new GoogleGenAI({
              apiKey: getUserAiApiKey(user, masterKey),
              httpOptions: {
                headers: {
                  "User-Agent": "aistudio-build",
                },
              },
            });
          }
          const response = await safeGenerateContent(userAi, {
            model: model,
            contents: prompt,
            config: {
              systemInstruction: "You are an expert knowledge-graph assistant for LLM Wiki. Analyze note contents, extract exactly 5 tags, pick up to 3 most relevant connections from existing notes, and generate a concise 1-2 sentence Japanese summary of the memo content. When extracting tags, automatically consolidate/merge semantically similar or synonymous tags under a single representative tag. If consolidation results in fewer than 5 tags, you must generate additional unique, highly relevant tags so that the final tags array contains exactly 5 tags. Be precise and consistent.",
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Exactly 5 relevant tags for the memo, applying consolidation and replenishment to ensure there are always exactly 5 tags.",
                  },
                  relatedMemoIds: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Up to 3 relevant memo IDs to link to, selected from the provided existing memos list.",
                  },
                  summary: {
                    type: Type.STRING,
                    description: "A concise 1-2 sentence Japanese summary of the memo content.",
                  }
                },
                required: ["tags", "relatedMemoIds", "summary"],
              },
            },
          });
          resultText = response?.text || "{}";
        } else {
          // OpenAI Compatible call
          const cleanEndpoint = endpoint.trim().replace(/\/+$/, "");
          let responseFormatObj: any = { type: "json_object" };
          let fetchBody: any = {
            model: model,
            messages: [
              {
                role: "system",
                content: "You are an expert knowledge-graph assistant for LLM Wiki. Analyze note contents, extract exactly 5 tags, pick up to 3 most relevant connections from existing notes, and generate a concise 1-2 sentence Japanese summary. When extracting tags, automatically consolidate/merge semantically similar or synonymous tags under a single representative tag. If consolidation results in fewer than 5 tags, you must generate additional unique, highly relevant tags so that the final tags array contains exactly 5 tags. Be precise and consistent. Return only a JSON object containing a \"tags\" string array (exactly 5 items), a \"relatedMemoIds\" string array (up to 3 items), and a \"summary\" string (concise 1-2 sentence Japanese summary)."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            response_format: responseFormatObj
          };

          let res = await fetch(`${cleanEndpoint}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify(fetchBody)
          });

          if (!res.ok) {
            // Retry once without response_format in case local/custom API doesn't support it
            delete fetchBody.response_format;
            res = await fetch(`${cleanEndpoint}/chat/completions`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
              },
              body: JSON.stringify(fetchBody)
            });
          }

          if (!res.ok) {
            const errText = await res.text();
            throw new Error(`OpenAI API returned status ${res.status}: ${errText}`);
          }

          const chatResult = await res.json();
          resultText = chatResult.choices?.[0]?.message?.content || "{}";
        }
        break; // Success
      } catch (err: any) {
        attempts++;
        console.info(`AI API attempt ${attempts} info: ${err.message || err}. Retrying...`);
        if (attempts >= maxAttempts) {
          throw err; // Out of attempts, hit fallback
        }
        // Exponential backoff
        await sleep(attempts * 1000);
      }
    }

    const result = parseResponseText(resultText);
    let finalTags = Array.isArray(result.tags) ? result.tags.filter(Boolean) : ["General"];
    
    // Normalize: strip outer spaces/hashes and filter duplicates
    finalTags = Array.from(new Set(finalTags.map((t: string) => t.trim().replace(/^#+/, "").trim()))).filter(Boolean);
    
    // Pad to exactly 5 if consolidation or response parsing resulted in fewer than 5 tags
    const defaultTags = ["General", "Personal", "Knowledge", "Workspace", "Note", "Draft", "Idea", "Research"];
    let defaultIdx = 0;
    while (finalTags.length < 5) {
      const nextTag = defaultTags[defaultIdx % defaultTags.length];
      if (!finalTags.some(t => t.toLowerCase() === nextTag.toLowerCase())) {
        finalTags.push(nextTag);
      }
      defaultIdx++;
    }
    
    return {
      tags: finalTags.slice(0, 5),
      relatedMemoIds: Array.isArray(result.relatedMemoIds) ? result.relatedMemoIds.slice(0, 3) : [],
      summary: typeof result.summary === "string" ? result.summary : "",
    };
  } catch (err: any) {
    console.info("AI metadata generation skipped (using high-fidelity fallback):", err?.message || err);
    
    // Smart Local Heuristics Fallback
    // 1. Generate 5 contextually relevant tags
    const cleanText = `${title} ${content}`.replace(/[#*`_\[\]\(\)\n\r\t]/g, " ");
    
    // Extract potential Japanese terms (Kanji sequences of length 2-6)
    const kanjiRegex = /[\u4e00-\u9faf]{2,6}/g;
    const kanjiMatches = cleanText.match(kanjiRegex) || [];
    
    // Extract English/Latin words of length >= 3
    const englishRegex = /[a-zA-Z]{3,15}/g;
    const englishMatches = cleanText.match(englishRegex) || [];
    
    // Merge and deduplicate candidates
    const candidates = Array.from(new Set([
      ...kanjiMatches,
      ...englishMatches.map(w => w.toLowerCase())
    ])).filter(t => {
      const common = ["the", "and", "for", "with", "you", "this", "that", "from", "your", "memo", "wiki", "has", "are"];
      return !common.includes(t.toLowerCase());
    });

    const fallbackTags: string[] = [];
    for (const c of candidates) {
      if (fallbackTags.length < 5) {
        const formatted = /^[a-zA-Z]+$/.test(c) ? c.charAt(0).toUpperCase() + c.slice(1) : c;
        if (!fallbackTags.includes(formatted)) {
          fallbackTags.push(formatted);
        }
      } else {
        break;
      }
    }

    // Pad with defaults if not enough
    const defaultTags = ["General", "Personal", "Knowledge", "Workspace", "Note", "Draft", "Idea", "Research"];
    let defaultIdx = 0;
    while (fallbackTags.length < 5) {
      const nextTag = defaultTags[defaultIdx % defaultTags.length];
      if (!fallbackTags.includes(nextTag)) {
        fallbackTags.push(nextTag);
      }
      defaultIdx++;
    }

    // 2. Discover related memos based on title word matching or shared tags
    const relatedMemoIds: string[] = [];
    if (existingMemos && existingMemos.length > 0) {
      const scoredMemos = existingMemos
        .filter((m: any) => m.id !== currentMemoId)
        .map((m: any) => {
          let score = 0;
          
          if (m.title && m.title.length > 1) {
            // If existing memo title is inside current title/content
            if (title.includes(m.title) || content.includes(m.title)) {
              score += 5;
            }
            // Reverse containment
            if (m.title.includes(title)) {
              score += 3;
            }
          }

          // Shared tags
          if (m.tags && Array.isArray(m.tags)) {
            const sharedTags = m.tags.filter((t: string) => 
              fallbackTags.some(ft => ft.toLowerCase() === t.toLowerCase())
            );
            score += sharedTags.length * 2.5;
          }

          return { id: m.id, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

      scoredMemos.slice(0, 3).forEach(item => {
        relatedMemoIds.push(item.id);
      });
    }

    const cleanContent = (content || "").replace(/[\s\n\r\t]+/g, " ").trim();
    const fallbackSummary = cleanContent.length > 80 ? cleanContent.slice(0, 80) + "..." : cleanContent || `${title}のメモ。`;

    return {
      tags: fallbackTags,
      relatedMemoIds,
      summary: fallbackSummary,
    };
  }
}

// 5. Memo Endpoint: Get Decrypted Memos
app.get("/api/memos", requireAuth, (req: any, res) => {
  const { userId, masterKey } = req.session;
  const db = readDB();

  const userMemos = db.memos
    .filter((m: any) => m.userId === userId)
    .map((m: any) => {
      try {
        const decryptedContent = decrypt(m.encryptedContent, masterKey);
        return {
          id: m.id,
          userId: m.userId,
          title: m.title,
          content: decryptedContent,
          tags: m.tags || [],
          relatedMemoIds: m.relatedMemoIds || [],
          summary: m.summary || "",
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          googleFileId: m.googleFileId || undefined,
          googleFileName: m.googleFileName || undefined,
        };
      } catch (err) {
        console.error(`Failed to decrypt memo ${m.id}:`, err);
        return {
          id: m.id,
          userId: m.userId,
          title: m.title,
          content: "[Decryption Failed]",
          tags: m.tags || [],
          relatedMemoIds: m.relatedMemoIds || [],
          summary: m.summary || "",
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          googleFileId: m.googleFileId || undefined,
          googleFileName: m.googleFileName || undefined,
        };
      }
    });

  res.json(userMemos);
});

// 6. Memo Endpoint: Create/Update Memo
app.post("/api/memos", requireAuth, async (req: any, res) => {
  const { userId, masterKey } = req.session;
  const { id, title, content, googleFileId, googleFileName } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }

  const db = readDB();
  const existingMemos = db.memos
    .filter((m: any) => m.userId === userId)
    .map((m: any) => {
      try {
        return { id: m.id, title: m.title, tags: m.tags || [] };
      } catch {
        return { id: m.id, title: m.title, tags: [] };
      }
    });

  const targetId = id || crypto.randomUUID();
  
  // Skip AI metadata generation on creation (which doesn't have an ID in req.body) to keep it fast.
  // Generate tags and connection links via Gemini only on saving (when ID is provided in req.body).
  let metadata;
  if (!id) {
    metadata = {
      tags: ["General"],
      relatedMemoIds: [] as string[],
      summary: "新規作成されたメモ。",
    };
  } else {
    metadata = await generateMemoMetadata(title, content || "", userId, targetId, existingMemos, masterKey);
  }

  const encryptedContent = encrypt(content || "", masterKey);
  const now = new Date().toISOString();

  let savedMemo: any;
  const existingIndex = db.memos.findIndex((m: any) => m.id === targetId && m.userId === userId);

  if (existingIndex !== -1) {
    // Update
    db.memos[existingIndex] = {
      ...db.memos[existingIndex],
      title,
      encryptedContent,
      tags: metadata.tags,
      relatedMemoIds: metadata.relatedMemoIds,
      summary: metadata.summary,
      updatedAt: now,
      googleFileId: googleFileId !== undefined ? googleFileId : db.memos[existingIndex].googleFileId,
      googleFileName: googleFileName !== undefined ? googleFileName : db.memos[existingIndex].googleFileName,
    };
    savedMemo = db.memos[existingIndex];
  } else {
    // Create
    savedMemo = {
      id: targetId,
      userId,
      title,
      encryptedContent,
      tags: metadata.tags,
      relatedMemoIds: metadata.relatedMemoIds,
      summary: metadata.summary,
      createdAt: now,
      updatedAt: now,
      googleFileId: googleFileId || undefined,
      googleFileName: googleFileName || undefined,
    };
    db.memos.push(savedMemo);
  }

  writeDB(db);

  res.json({
    id: targetId,
    userId,
    title,
    content: content || "",
    tags: metadata.tags,
    relatedMemoIds: metadata.relatedMemoIds,
    summary: metadata.summary,
    createdAt: savedMemo.createdAt,
    updatedAt: savedMemo.updatedAt,
    googleFileId: savedMemo.googleFileId,
    googleFileName: savedMemo.googleFileName,
  });
});

// 7. Memo Endpoint: Regenerate Metadata (Tags and Connections)
app.post("/api/memos/:id/regenerate-metadata", requireAuth, async (req: any, res) => {
  const { userId, masterKey } = req.session;
  const { id } = req.params;

  const db = readDB();
  const memoIndex = db.memos.findIndex((m: any) => m.id === id && m.userId === userId);
  if (memoIndex === -1) {
    return res.status(404).json({ error: "Memo not found" });
  }

  const memo = db.memos[memoIndex];
  let content = "";
  try {
    content = decrypt(memo.encryptedContent, masterKey);
  } catch (err) {
    return res.status(500).json({ error: "Decryption failed during regeneration" });
  }

  const existingMemos = db.memos
    .filter((m: any) => m.userId === userId)
    .map((m: any) => ({ id: m.id, title: m.title, tags: m.tags || [] }));

  const metadata = await generateMemoMetadata(memo.title, content, userId, id, existingMemos, masterKey);

  db.memos[memoIndex].tags = metadata.tags;
  db.memos[memoIndex].relatedMemoIds = metadata.relatedMemoIds;
  db.memos[memoIndex].summary = metadata.summary;
  db.memos[memoIndex].updatedAt = new Date().toISOString();

  writeDB(db);

  res.json({
    id,
    title: memo.title,
    content,
    tags: metadata.tags,
    relatedMemoIds: metadata.relatedMemoIds,
    summary: metadata.summary,
    createdAt: memo.createdAt,
    updatedAt: db.memos[memoIndex].updatedAt,
  });
});

// 7.2. Memo Endpoint: Batch Regenerate Metadata for All Memos
app.post("/api/memos/batch-regenerate-metadata", requireAuth, async (req: any, res) => {
  const { userId, masterKey } = req.session;
  const db = readDB();

  const userMemos = db.memos.filter((m: any) => m.userId === userId);
  if (userMemos.length === 0) {
    return res.json({ success: true, message: "メモがありません。", count: 0, memos: [] });
  }

  // Decrypt all user memos first so generateMemoMetadata can check titles and tags
  const decryptedMemos: any[] = [];
  for (const m of userMemos) {
    try {
      const content = decrypt(m.encryptedContent, masterKey);
      decryptedMemos.push({
        ...m,
        content
      });
    } catch (err) {
      decryptedMemos.push({
        ...m,
        content: ""
      });
    }
  }

  const updatedMemos: any[] = [];
  const now = new Date().toISOString();

  // Process sequentially to keep API usage orderly and allow links to build on each other
  for (let i = 0; i < decryptedMemos.length; i++) {
    const current = decryptedMemos[i];
    const existingList = decryptedMemos
      .filter((m: any) => m.id !== current.id)
      .map((m: any) => ({
        id: m.id,
        title: m.title,
        tags: m.tags || []
      }));

    try {
      const metadata = await generateMemoMetadata(
        current.title,
        current.content,
        userId,
        current.id,
        existingList,
        masterKey
      );

      const idx = db.memos.findIndex((m: any) => m.id === current.id && m.userId === userId);
      if (idx !== -1) {
        db.memos[idx].tags = metadata.tags;
        db.memos[idx].relatedMemoIds = metadata.relatedMemoIds;
        db.memos[idx].summary = metadata.summary;
        db.memos[idx].updatedAt = now;

        // Update in-memory so subsequent iterations see updated tags/connections
        decryptedMemos[i].tags = metadata.tags;
        decryptedMemos[i].relatedMemoIds = metadata.relatedMemoIds;
        decryptedMemos[i].summary = metadata.summary;

        updatedMemos.push({
          id: current.id,
          title: current.title,
          content: current.content,
          tags: metadata.tags,
          relatedMemoIds: metadata.relatedMemoIds,
          summary: metadata.summary,
          createdAt: db.memos[idx].createdAt,
          updatedAt: now,
        });
      }
    } catch (err: any) {
      console.error(`Failed to regenerate metadata for memo ${current.id}:`, err);
    }
  }

  writeDB(db);
  res.json({ success: true, count: updatedMemos.length, memos: updatedMemos });
});

// 7.5. Memo Endpoint: AI Conversational Search and Chat
app.post("/api/memos/search-chat", requireAuth, async (req: any, res) => {
  const { userId, masterKey } = req.session;
  const { message, history } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const db = readDB();
  const decryptedMemos = db.memos
    .filter((m: any) => m.userId === userId)
    .map((m: any) => {
      let decryptedContent = "";
      try {
        decryptedContent = decrypt(m.encryptedContent, masterKey);
      } catch (err) {
        decryptedContent = "[Decryption Failed]";
      }
      return {
        id: m.id,
        title: m.title,
        tags: m.tags || [],
        relatedMemoIds: m.relatedMemoIds || [],
        summary: m.summary || "",
        content: decryptedContent,
      };
    });

  try {
    const memosListText = decryptedMemos
      .map((m: any) => {
        const contentSnippet = m.content.length > 500 ? m.content.slice(0, 500) + "..." : m.content;
        return `ID: "${m.id}"
Title: "${m.title}"
Tags: [${m.tags.join(", ")}]
Summary: "${m.summary}"
Content Snippet: "${contentSnippet}"
Related Memo IDs: [${m.relatedMemoIds.join(", ")}]`;
      })
      .join("\n\n---\n\n");

    let conversationHistoryText = "";
    if (Array.isArray(history) && history.length > 0) {
      conversationHistoryText = history
        .map((h: any) => `${h.role === "user" ? "User" : "Assistant"}: ${h.content}`)
        .join("\n");
    }

    const prompt = `You are a highly versatile, expert knowledge AI Assistant for LLM Wiki.
The user is chatting with you. You can do the following:
1. Search and answer questions about their memos.
2. CREATE a new memo/file if requested (e.g., "Create a memo about X", "Write down a recipe for Y", "〜についてメモを作成して").
3. UPDATE/EDIT/MODIFY/APPEND to an existing memo/file if requested (e.g., "Add Z to my meeting notes memo", "Update the content of X").

You have access to the user's entire knowledge base (memos list) below.
If you need to edit/update a memo, make sure to find its correct ID from the list below and specify it as 'targetMemoId'.

User's memos list:
=========================================
${memosListText || "(No memos exist yet)"}
=========================================

Previous conversation history:
${conversationHistoryText || "(No previous history)"}

Latest User Message: "${message}"

Your tasks:
1. Conversation / Search Answer (response): Write a helpful, friendly response in Japanese (using markdown) answering the user's query or describing the action you took (e.g. "〇〇のメモを新しく作成しました！").
2. Memo Linking (matchedMemoIds): Identify which memo IDs from the provided list are highly relevant or referenced, and return them as a list of strings in "matchedMemoIds". If no memos match, return an empty array.
3. Action Execution (action):
   - If the user explicitly or implicitly requests to create a new memo/file/record (e.g., "Create a memo", "Write this down", "Save a note about X", "〜について書いて", "メモを作成して"), you MUST set type to "create", generate a concise and relevant "memoTitle", and generate a rich, complete and well-structured body content in "memoContent" (never leave it empty or summarized; write the full article/note content in Japanese Markdown). Set targetMemoId to "".
   - If the user requests to edit, update, modify, rewrite or append to an existing memo (e.g., "Add X to my meeting notes", "Update memo Y"), you MUST set type to "update", identify the correct memo's ID from the list below and set it to "targetMemoId", set "memoTitle" to its title, and construct the COMPLETE UPDATED content (merging the new content/changes into the existing content cleanly) inside "memoContent".
   - If the request is a simple query, question, or search with no intent to create or edit memos, set type to "none", and set "memoTitle", "memoContent", and "targetMemoId" all to "".

CRITICAL RULE FOR MEMO GENERATION/EDITING:
- You must write the actual rich content for the memo in "memoContent" in Japanese Markdown. Do not just write a short summary unless asked. Generate a comprehensive text as if a human wrote it.
- If the user's message includes user-attached file information with a URL (such as '■ ファイル名: audio.mp3 (種類: audio/mp3, URL: /uploads/...)'), you MUST embed that file nicely in the generated or updated 'memoContent' at a contextually appropriate location using standard Markdown image/audio/video embed tags (e.g., '![alt text](url)'). For images, use the format '![画像: 説明](url)'. For audio, use '![音声: 説明](url)'. For video, use '![動画: 説明](url)'. Ensure you place them beautifully to structure the memo content (e.g., placing an uploaded image below a heading, or a voice/video clip near its transcript summary).
- Since all fields ("type", "memoTitle", "memoContent", "targetMemoId") are required in the output JSON schema, you MUST provide them. Use empty string "" for any unused field (do not omit them).

Return ONLY a JSON response matching the required schema.
`;

    const user = db.users.find((u: any) => u.id === userId);
    const provider = user?.aiProvider || "gemini";
    const apiKey = getUserAiApiKey(user, masterKey) || process.env.GEMINI_API_KEY || "dummy";
    const endpoint = user?.aiEndpoint || "https://api.openai.com/v1";
    const model = user?.aiModel || "gemini-3.5-flash";

    let resultText = "";
    if (provider === "gemini") {
      let userAi = ai;
      if (getUserAiApiKey(user, masterKey)) {
        userAi = new GoogleGenAI({
          apiKey: getUserAiApiKey(user, masterKey),
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });
      }
      const response = await safeGenerateContent(userAi, {
        model: model,
        contents: prompt,
        config: {
          systemInstruction: "You are a highly versatile AI Assistant for LLM Wiki. You can search memos, answer questions, CREATE new memos, or UPDATE/EDIT existing memos in Japanese. Return a JSON containing 'response' (markdown string), 'matchedMemoIds' (array of string IDs), and an 'action' object specifying the type ('create', 'update', or 'none'), memoTitle, memoContent, and targetMemoId.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              response: {
                type: Type.STRING,
                description: "Conversational response in Japanese explaining search results or actions taken.",
              },
              matchedMemoIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "List of matching memo IDs from the user's memos list.",
              },
              action: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    description: "Action type: 'create' to create a new memo, 'update' to edit/update an existing memo, or 'none' for normal search/chat.",
                  },
                  memoTitle: {
                    type: Type.STRING,
                    description: "The title of the memo to create or update.",
                  },
                  memoContent: {
                    type: Type.STRING,
                    description: "The full body/content of the memo to create or update.",
                  },
                  targetMemoId: {
                    type: Type.STRING,
                    description: "Required for 'update' action. The ID of the existing memo to update.",
                  },
                },
                required: ["type", "memoTitle", "memoContent", "targetMemoId"],
              },
            },
            required: ["response", "matchedMemoIds", "action"],
          },
        },
      });
      resultText = response?.text || "{}";
    } else {
      // OpenAI-compatible
      const cleanEndpoint = endpoint.trim().replace(/\/+$/, "");
      let fetchBody: any = {
        model: model,
        messages: [
          {
            role: "system",
            content: "You are a highly versatile AI Assistant for LLM Wiki. Help the user search memos, answer questions, CREATE new memos, or UPDATE/EDIT existing memos in Japanese. Return only a JSON object containing 'response' (markdown string), 'matchedMemoIds' (array of matching memo IDs), and an 'action' object with 'type' ('create', 'update', or 'none'), 'memoTitle' (string), 'memoContent' (string), and 'targetMemoId' (string). All action fields are required; use empty string \"\" for empty or unused fields (never omit them)."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      };

      let res = await fetch(`${cleanEndpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(fetchBody)
      });

      if (!res.ok) {
        // Retry without json format in case endpoint doesn't support it
        delete fetchBody.response_format;
        res = await fetch(`${cleanEndpoint}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify(fetchBody)
        });
      }

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API returned status ${res.status}: ${errText}`);
      }

      const chatResult = await res.json();
      resultText = chatResult.choices?.[0]?.message?.content || "{}";
    }

    const parsed = parseResponseText(resultText);

    let actionResult: any = null;

    if (parsed.action && (parsed.action.type === "create" || parsed.action.type === "update")) {
      const { type, memoTitle, memoContent, targetMemoId } = parsed.action;
      
      if (type === "create" && memoTitle) {
        // Create new memo
        const targetId = crypto.randomUUID();
        const existingMemos = decryptedMemos.map((m: any) => ({ id: m.id, title: m.title, tags: m.tags || [] }));
        
        // Generate metadata
        const metadata = await generateMemoMetadata(memoTitle, memoContent || "", userId, targetId, existingMemos, masterKey);
        const encryptedContent = encrypt(memoContent || "", masterKey);
        const now = new Date().toISOString();
        
        const newMemo = {
          id: targetId,
          userId,
          title: memoTitle,
          encryptedContent,
          tags: metadata.tags,
          relatedMemoIds: metadata.relatedMemoIds,
          summary: metadata.summary,
          createdAt: now,
          updatedAt: now,
        };
        
        db.memos.push(newMemo);
        writeDB(db);
        
        actionResult = {
          type: "create",
          memoId: targetId,
          memoTitle: memoTitle,
        };
      } else if (type === "update" && targetMemoId && memoTitle) {
        // Update existing memo
        const existingIndex = db.memos.findIndex((m: any) => m.id === targetMemoId && m.userId === userId);
        if (existingIndex !== -1) {
          const existingMemos = decryptedMemos.map((m: any) => ({ id: m.id, title: m.title, tags: m.tags || [] }));
          const metadata = await generateMemoMetadata(memoTitle, memoContent || "", userId, targetMemoId, existingMemos, masterKey);
          const encryptedContent = encrypt(memoContent || "", masterKey);
          const now = new Date().toISOString();
          
          db.memos[existingIndex] = {
            ...db.memos[existingIndex],
            title: memoTitle,
            encryptedContent,
            tags: metadata.tags,
            relatedMemoIds: metadata.relatedMemoIds,
            summary: metadata.summary,
            updatedAt: now,
          };
          
          writeDB(db);
          
          actionResult = {
            type: "update",
            memoId: targetMemoId,
            memoTitle: memoTitle,
          };
        }
      }
    }

    res.json({
      response: parsed.response || "処理が完了しました。",
      matchedMemoIds: Array.isArray(parsed.matchedMemoIds) ? parsed.matchedMemoIds : [],
      actionResult: actionResult,
    });
  } catch (err: any) {
    console.error("AI Search Chat failed (falling back to keyword search):", err);
    // Local keyword fallback search
    const queryLower = message.toLowerCase();
    const matched = decryptedMemos.filter((m: any) => {
      return (
        m.title.toLowerCase().includes(queryLower) ||
        m.summary.toLowerCase().includes(queryLower) ||
        m.tags.some((t: string) => t.toLowerCase().includes(queryLower)) ||
        m.content.toLowerCase().includes(queryLower)
      );
    });

    const listText = matched.map((m: any) => `・「${m.title}」（タグ: ${m.tags.join(", ")}）`).join("\n");
    const responseText = matched.length > 0
      ? `【ローカル検索結果】キーワード「${message}」に一致するメモが ${matched.length} 件見つかりました。\n\n${listText}`
      : `【ローカル検索結果】キーワード「${message}」に一致するメモは見つかりませんでした。`;

    res.json({
      response: responseText,
      matchedMemoIds: matched.map((m: any) => m.id),
    });
  }
});

// 7.6. Memo Endpoint: AI Voice Input Cleanup
app.post("/api/memos/clean-voice", requireAuth, async (req: any, res) => {
  const { userId, masterKey } = req.session;
  const { transcript } = req.body;

  if (!transcript) {
    return res.status(400).json({ error: "Transcript is required" });
  }

  const db = readDB();
  const user = db.users.find((u: any) => u.id === userId);
  const provider = user?.aiProvider || "gemini";
  const apiKey = getUserAiApiKey(user, masterKey) || process.env.GEMINI_API_KEY || "dummy";
  const endpoint = user?.aiEndpoint || "https://api.openai.com/v1";
  const model = user?.aiModel || "gemini-3.5-flash";

  const prompt = `You are an expert speech-to-text correction assistant for LLM Wiki.
The user spoke a search query or a question, but it contains filler words, stutters, repetition, or speech recognition errors like "アー", "ウー", "えーっと", "あのー", "えっと".
Clean it up to make it a natural, clear Japanese search query or question about their memos.
If the transcription is already clean, keep it as is.
Do NOT add any greetings, preambles, or postscripts. Return ONLY the cleaned Japanese text.

Original transcription: "${transcript}"`;

  try {
    let cleanedText = transcript;
    if (provider === "gemini") {
      let userAi = ai;
      if (getUserAiApiKey(user, masterKey)) {
        userAi = new GoogleGenAI({
          apiKey: getUserAiApiKey(user, masterKey),
          httpOptions: { headers: { "User-Agent": "aistudio-build" } },
        });
      }
      const response = await safeGenerateContent(userAi, {
        model: model,
        contents: prompt,
        config: {
          systemInstruction: "You are an expert speech recognition correction assistant. Correct filler words and stutters in Japanese transcriptions. Return only the corrected query string without any other explanation.",
        },
      });
      cleanedText = response?.text?.trim() || transcript;
    } else {
      // OpenAI-compatible
      const cleanEndpoint = endpoint.trim().replace(/\/+$/, "");
      const resApi = await fetch(`${cleanEndpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: "system",
              content: "You are an expert speech recognition correction assistant. Correct filler words and stutters in Japanese transcriptions. Return only the corrected query string without any other explanation."
            },
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });

      if (resApi.ok) {
        const chatResult = await resApi.json();
        cleanedText = chatResult.choices?.[0]?.message?.content?.trim() || transcript;
      }
    }

    res.json({ cleaned: cleanedText });
  } catch (err: any) {
    console.error("AI clean-voice failed:", err);
    res.json({ cleaned: transcript }); // Fallback to raw transcript
  }
});

// 7.7. Memo Endpoint: AI Dynamic Query Suggestions
app.post("/api/memos/dynamic-suggestions", requireAuth, async (req: any, res) => {
  const { userId, masterKey } = req.session;

  const db = readDB();
  const decryptedMemos = db.memos
    .filter((m: any) => m.userId === userId)
    .map((m: any) => {
      let decryptedContent = "";
      try {
        decryptedContent = decrypt(m.encryptedContent, masterKey);
      } catch (err) {
        decryptedContent = "[Decryption Failed]";
      }
      return {
        id: m.id,
        title: m.title,
        tags: m.tags || [],
        summary: m.summary || "",
        content: decryptedContent,
      };
    });

  if (decryptedMemos.length === 0) {
    return res.json({
      suggestions: [
        "タスク管理に関するメモはありますか？",
        "最近作成されたメモを要約して教えてください。",
        "仕事や勉強に関連するメモとタグを教えてください。",
        "面白いアイディアやお笑いに関するメモを検索して",
      ]
    });
  }

  const user = db.users.find((u: any) => u.id === userId);
  const provider = user?.aiProvider || "gemini";
  const apiKey = getUserAiApiKey(user, masterKey) || process.env.GEMINI_API_KEY || "dummy";
  const endpoint = user?.aiEndpoint || "https://api.openai.com/v1";
  const model = user?.aiModel || "gemini-3.5-flash";

  const memosOverview = decryptedMemos
    .map((m: any) => `Title: "${m.title}", Tags: [${m.tags.join(", ")}], Summary: "${m.summary}"`)
    .slice(0, 15) // Limit to top 15 memos to keep token count low
    .join("\n");

  const prompt = `You are a query suggestion generator for a personal knowledge base called LLM Wiki.
Analyze the list of the user's memos below, and generate 4 realistic, interesting, and useful queries or questions in Japanese that this user might want to ask an AI assistant about their knowledge.
Make sure the queries are diverse and highly specific to their actual content. Do not generate generic questions if they have specific themes (e.g. if they have programming notes, ask about code or algorithms; if they have trip plans, ask about destinations).

User's Memos List Overview:
=========================================
${memosOverview}
=========================================

Return ONLY a JSON response matching this schema:
{
  "suggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3", "Suggestion 4"]
}`;

  try {
    let resultText = "";
    if (provider === "gemini") {
      let userAi = ai;
      if (getUserAiApiKey(user, masterKey)) {
        userAi = new GoogleGenAI({
          apiKey: getUserAiApiKey(user, masterKey),
          httpOptions: { headers: { "User-Agent": "aistudio-build" } },
        });
      }
      const response = await safeGenerateContent(userAi, {
        model: model,
        contents: prompt,
        config: {
          systemInstruction: "You are an expert query suggestion assistant. Return a JSON containing an array 'suggestions' of exactly 4 strings in Japanese.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Array of exactly 4 query suggestions in Japanese.",
              },
            },
            required: ["suggestions"],
          },
        },
      });
      resultText = response?.text || "{}";
    } else {
      // OpenAI-compatible
      const cleanEndpoint = endpoint.trim().replace(/\/+$/, "");
      let fetchBody: any = {
        model: model,
        messages: [
          {
            role: "system",
            content: "You are an expert query suggestion assistant. Return a JSON containing an array 'suggestions' of exactly 4 strings in Japanese."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        response_format: { type: "json_object" }
      };

      let resApi = await fetch(`${cleanEndpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(fetchBody)
      });

      if (!resApi.ok) {
        delete fetchBody.response_format;
        resApi = await fetch(`${cleanEndpoint}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify(fetchBody)
        });
      }

      if (resApi.ok) {
        const chatResult = await resApi.json();
        resultText = chatResult.choices?.[0]?.message?.content || "{}";
      }
    }

    const fallbackSuggestions = (() => {
      const suggestions: string[] = [];
      const allTags = Array.from(new Set(decryptedMemos.flatMap((m: any) => m.tags || []).filter(Boolean)));
      const allMemos = [...decryptedMemos].filter((m: any) => m.title && m.title !== "新規メモ");

      if (allTags.length > 0) {
        suggestions.push(`タグ「${allTags[0]}」に関連するメモの一覧と概要を教えてください。`);
      }
      if (allMemos.length > 0) {
        suggestions.push(`「${allMemos[0].title}」のメモをわかりやすく要約してください。`);
      }
      if (allTags.length > 1) {
        suggestions.push(`「${allTags[1]}」タグが付いているメモの重要ポイントを教えてください。`);
      } else if (allMemos.length > 1) {
        suggestions.push(`「${allMemos[1].title}」の内容と、関連する他のメモはありますか？`);
      }
      if (allMemos.length > 2) {
        suggestions.push(`「${allMemos[allMemos.length - 1].title}」に関する仕事やアイディアのメモを検索して。`);
      }

      const defaults = [
        "タスク管理に関するメモはありますか？",
        "最近作成されたメモを要約して教えてください。",
        "仕事や勉強に関連するメモとタグを教えてください。",
        "面白いアイディアやお笑いに関するメモを検索して",
      ];

      for (const d of defaults) {
        if (suggestions.length >= 4) break;
        if (!suggestions.includes(d)) {
          suggestions.push(d);
        }
      }
      return suggestions.slice(0, 4);
    })();

    const parsed = parseResponseText(resultText);
    const suggestions = Array.isArray(parsed.suggestions) && parsed.suggestions.length === 4
      ? parsed.suggestions
      : fallbackSuggestions;

    res.json({ suggestions });
  } catch (err: any) {
    console.warn("AI dynamic-suggestions failed gracefully (using local fallback suggestions):", err.message || err);
    const fallbackSuggestions = (() => {
      const suggestions: string[] = [];
      const allTags = Array.from(new Set(decryptedMemos.flatMap((m: any) => m.tags || []).filter(Boolean)));
      const allMemos = [...decryptedMemos].filter((m: any) => m.title && m.title !== "新規メモ");

      if (allTags.length > 0) {
        suggestions.push(`タグ「${allTags[0]}」に関連するメモの一覧と概要を教えてください。`);
      }
      if (allMemos.length > 0) {
        suggestions.push(`「${allMemos[0].title}」のメモをわかりやすく要約してください。`);
      }
      if (allTags.length > 1) {
        suggestions.push(`「${allTags[1]}」タグが付いているメモの重要ポイントを教えてください。`);
      } else if (allMemos.length > 1) {
        suggestions.push(`「${allMemos[1].title}」の内容と、関連する他のメモはありますか？`);
      }
      if (allMemos.length > 2) {
        suggestions.push(`「${allMemos[allMemos.length - 1].title}」に関する仕事やアイディアのメモを検索して。`);
      }

      const defaults = [
        "タスク管理に関するメモはありますか？",
        "最近作成されたメモを要約して教えてください。",
        "仕事や勉強に関連するメモとタグを教えてください。",
        "面白いアイディアやお笑いに関するメモを検索して",
      ];

      for (const d of defaults) {
        if (suggestions.length >= 4) break;
        if (!suggestions.includes(d)) {
          suggestions.push(d);
        }
      }
      return suggestions.slice(0, 4);
    })();

    res.json({ suggestions: fallbackSuggestions });
  }
});

// 7.8. Memo Endpoint: Export Memos (Encrypted with a user-supplied password)
app.post("/api/memos/export", requireAuth, async (req: any, res) => {
  const { userId, masterKey } = req.session;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: "Password is required for encryption" });
  }

  try {
    const db = readDB();
    const userMemos = db.memos.filter((m: any) => m.userId === userId);

    // Decrypt content using current user's masterKey to get plaintext memos
    const memosToExport = userMemos.map((m: any) => {
      let content = "";
      try {
        content = decrypt(m.encryptedContent, masterKey);
      } catch (err) {
        content = "[Decryption Failed]";
      }
      return {
        id: m.id,
        title: m.title,
        content: content,
        tags: m.tags || [],
        relatedMemoIds: m.relatedMemoIds || [],
        summary: m.summary || "",
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      };
    });

    // Encrypt the exported payload with the user's password
    const exportSalt = crypto.randomBytes(16);
    const exportKey = deriveKey(password, exportSalt);
    const serializedData = JSON.stringify({
      version: "1.0",
      exportedAt: new Date().toISOString(),
      memos: memosToExport
    });

    const encryptedData = encrypt(serializedData, exportKey);

    res.json({
      salt: exportSalt.toString("hex"),
      encryptedData,
    });
  } catch (err: any) {
    console.error("Export failed:", err);
    res.status(500).json({ error: "Failed to export data: " + err.message });
  }
});

// 7.9. Memo Endpoint: Import Memos (Decrypted with user-supplied password)
app.post("/api/memos/import", requireAuth, async (req: any, res) => {
  const { userId, masterKey } = req.session;
  const { password, salt, encryptedData, mode } = req.body; // mode: "merge" or "overwrite"

  if (!password || !salt || !encryptedData) {
    return res.status(400).json({ error: "Password, salt, and encrypted data are required" });
  }

  try {
    // Derive the key using the same password and salt
    const importSalt = Buffer.from(salt, "hex");
    const importKey = deriveKey(password, importSalt);
    const decryptedJson = decrypt(encryptedData, importKey);

    const payload = JSON.parse(decryptedJson);
    if (!payload || !Array.isArray(payload.memos)) {
      return res.status(400).json({ error: "Invalid backup data format" });
    }

    const importedMemos = payload.memos;
    const db = readDB();

    // If overwrite mode, delete existing memos for this user
    if (mode === "overwrite") {
      db.memos = db.memos.filter((m: any) => m.userId !== userId);
    }

    let successCount = 0;

    for (const item of importedMemos) {
      if (!item.title) continue; // Skip invalid items

      // Re-encrypt the memo content using current user's masterKey for secure DB storage
      const encryptedContent = encrypt(item.content || "", masterKey);

      // Clean/generate unique ID if there's a collision or if we want to preserve
      let targetId = item.id || crypto.randomUUID();
      const existingIndex = db.memos.findIndex((m: any) => m.id === targetId && m.userId === userId);

      const now = new Date().toISOString();
      const newMemo = {
        id: targetId,
        userId,
        title: item.title,
        encryptedContent,
        tags: Array.isArray(item.tags) ? item.tags : ["General"],
        relatedMemoIds: Array.isArray(item.relatedMemoIds) ? item.relatedMemoIds : [],
        summary: item.summary || "",
        createdAt: item.createdAt || now,
        updatedAt: item.updatedAt || now,
      };

      if (existingIndex !== -1) {
        db.memos[existingIndex] = newMemo;
      } else {
        db.memos.push(newMemo);
      }
      successCount++;
    }

    writeDB(db);
    res.json({ success: true, count: successCount });
  } catch (err: any) {
    console.error("Import failed:", err);
    res.status(400).json({ error: "パスワードが違うか、ファイルが破損しています。" });
  }
});

// 7.10. Memo Endpoint: Analyze non-text files (Images, Audio, Video, PDF) and convert to text
app.post("/api/memos/analyze-file", requireAuth, async (req: any, res: any) => {
  const { userId, masterKey } = req.session;
  const { fileData, mimeType, fileName } = req.body;

  if (!fileData || !mimeType) {
    return res.status(400).json({ error: "fileData and mimeType are required" });
  }

  const db = readDB();
  const user = db.users.find((u: any) => u.id === userId);
  let provider = user?.aiProvider || "gemini";
  let apiKey = getUserAiApiKey(user, masterKey) || process.env.GEMINI_API_KEY || "dummy";
  let endpoint = user?.aiEndpoint || "https://api.openai.com/v1";
  let model = user?.aiModel || "gemini-3.5-flash";

  // Prompt based on mimeType
  let prompt = "";
  if (mimeType.startsWith("image/")) {
    prompt = `画像をOCR（文字認識）して分析し、画像に含まれるすべてのテキストを抽出するか、または画像の内容・レイアウトを、詳細で読みやすい日本語のMarkdown形式で記述してください。
メタな解説（「以下は画像の内容です」など）や挨拶、前置き、後書きは一切含めず、抽出・分析されたMarkdownテキストのみを出力してください。`;
  } else if (mimeType.startsWith("audio/")) {
    prompt = `この音声ファイルを正確に日本語で文字起こし（トランスクリプト）してください。
複数の話者がいる場合は、綺麗な対話/スクリプト形式（Markdown）に整形してください。
メタな解説（「以下は文字起こしです」など）や挨拶、前置き、後書きは一切含めず、文字起こしテキストのみを出力してください。`;
  } else if (mimeType.startsWith("video/")) {
    prompt = `この動画ファイルを分析し、話されている音声を日本語で文字起こしした上で、動画に映っている主要な視覚的イベントやテキスト、動きをわかりやすいMarkdown形式のノートにまとめてください。
メタな解説（「以下は動画の分析です」など）や挨拶、前置き、後書きは一切含めず、分析と文字起こしのMarkdownテキストのみを出力してください。`;
  } else if (mimeType.includes("pdf") || mimeType === "application/pdf") {
    prompt = `このPDFドキュメントを読み込み、含まれるすべてのテキストや重要な情報を抽出して、綺麗に構造化された日本語のMarkdown形式に変換してください。
メタな解説（「以下はPDFから抽出されたテキストです」など）や挨拶、前置き、後書きは一切含めず、抽出されたMarkdownテキストのみを出力してください。`;
  } else {
    prompt = `このファイルを分析し、抽出した内容を綺麗に整形された日本語のMarkdown形式で出力してください。
メタな解説や挨拶、前置き、後書きは一切含めず、結果のみを出力してください。`;
  }

  try {
    let resultText = "";

    // If it's a non-image file and provider is not gemini, we force fallback to Gemini to process PDF/audio/video natively.
    if (provider !== "gemini" && !mimeType.startsWith("image/")) {
      provider = "gemini";
      apiKey = process.env.GEMINI_API_KEY || "dummy";
      model = "gemini-3.5-flash"; // standard fallback
    }

    if (provider === "gemini") {
      let userAi = ai;
      // Use user's key if provided, else standard server key
      const finalApiKey = getUserAiApiKey(user, masterKey) || process.env.GEMINI_API_KEY;
      if (finalApiKey) {
        userAi = new GoogleGenAI({
          apiKey: finalApiKey,
          httpOptions: { headers: { "User-Agent": "aistudio-build" } },
        });
      }

      const filePart = {
        inlineData: {
          mimeType: mimeType,
          data: fileData,
        },
      };

      const textPart = {
        text: prompt,
      };

      let response;
      try {
        response = await safeGenerateContent(userAi, {
          model: model,
          contents: { parts: [filePart, textPart] },
        });
        resultText = response?.text?.trim() || "";
      } catch (geminiError: any) {
        console.warn("Direct multimodal file analysis failed, trying fallback...", geminiError);
        try {
          const buffer = Buffer.from(fileData, "base64");
          // check if it has binary characters
          const isBinary = buffer.some((byte) => byte === 0 || (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13));
          if (!isBinary) {
            const textContent = buffer.toString("utf-8");
            const fallbackResponse = await safeGenerateContent(userAi, {
              model: model,
              contents: `${prompt}\n\n[ファイル名: ${fileName || "unknown"}, ファイルタイプ: ${mimeType}]\n\nテキストコンテンツ:\n${textContent.slice(0, 50000)}`,
            });
            resultText = fallbackResponse?.text?.trim() || "";
          } else {
            const fallbackResponse = await safeGenerateContent(userAi, {
              model: model,
              contents: `以下のバイナリファイルがユーザーより添付されました。拡張子やファイル名、サイズからどのようなファイルか推測し、考えられる用途や特徴、構造を分かりやすく日本語で解説・要約してください。
ファイル名: ${fileName || "unknown"}
ファイル種別: ${mimeType}
サイズ: ${buffer.length} バイト`,
            });
            resultText = fallbackResponse?.text?.trim() || "";
          }
        } catch (fallbackError: any) {
          throw new Error(`ファイルの処理中にエラーが発生しました: ${geminiError.message || geminiError}`);
        }
      }
    } else {
      // OpenAI-compatible for images (Vision) or text
      const cleanEndpoint = endpoint.trim().replace(/\/+$/, "");
      let messages: any[] = [];

      if (mimeType.startsWith("image/")) {
        messages = [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${fileData}`
                }
              }
            ]
          }
        ];
      } else {
        messages = [
          {
            role: "user",
            content: `${prompt}\n\n[ファイル名: ${fileName || "unknown"}, ファイルタイプ: ${mimeType}]`
          }
        ];
      }

      const resApi = await fetch(`${cleanEndpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messages
        })
      });

      if (!resApi.ok) {
        const errorText = await resApi.text();
        throw new Error(`OpenAI API Error: ${errorText}`);
      }

      const data = await resApi.json();
      resultText = data?.choices?.[0]?.message?.content?.trim() || "";
    }

    res.json({ success: true, text: resultText });
  } catch (err: any) {
    console.error("File analysis failed:", err);
    res.status(500).json({ error: "AIによるファイル解析に失敗しました: " + (err.message || String(err)) });
  }
});

// 7.10.5. Memo Endpoint: Standard file upload for embedding in memos
app.post("/api/upload", requireAuth, async (req: any, res) => {
  const { userId, masterKey } = req.session;
  const { fileData, mimeType, fileName } = req.body;
  if (!fileData || !mimeType || !fileName) {
    return res.status(400).json({ error: "fileData, mimeType, and fileName are required" });
  }

  if (!masterKey) {
    return res.status(400).json({ error: "マスターキーがセッションに存在しません。一度ログアウトして再ログインしてください。" });
  }

  try {
    const rawBuffer = Buffer.from(fileData, "base64");
    const encryptedBuffer = encryptBuffer(rawBuffer, masterKey);
    
    const uuid = crypto.randomUUID();
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const safeName = `${uuid}-${cleanFileName}`;
    
    if (env.NOTEBOOK_WIKI_KV) {
      await env.NOTEBOOK_WIKI_KV.put(`upload:${safeName}`, encryptedBuffer.buffer);
    } else {
      throw new Error("NOTEBOOK_WIKI_KV binding not available");
    }
    
    const fileUrl = `/api/uploads/${safeName}`;
    
    res.json({ success: true, url: fileUrl, fileName, mimeType });
  } catch (err: any) {
    console.error("File upload failed:", err);
    res.status(500).json({ error: "ファイルのアップロードに失敗しました: " + err.message });
  }
});

// Custom auth middleware supporting query parameter tokens for static file requests
function requireAuthWithQuery(req: any, res: any, next: any) {
  let token = req.query.token;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split(" ")[1];
    }
  }
  
  if (!token) {
    return res.status(401).json({ error: "Unauthorized: Missing session token" });
  }
  const session = activeSessions.get(token);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized: Session expired or invalid" });
  }
  req.session = session;
  next();
}

// Secure media delivery endpoint: decrypts the file on-the-fly for authenticated sessions
app.get("/api/uploads/:filename", requireAuthWithQuery, async (req: any, res: any) => {
  const { masterKey } = req.session;
  const filename = req.params.filename;
  
  if (!masterKey) {
    return res.status(400).json({ error: "マスターキーがセッションに存在しません。再ログインしてください。" });
  }

  const safeName = path.basename(filename);
  
  try {
    if (!env.NOTEBOOK_WIKI_KV) {
      return res.status(500).json({ error: "NOTEBOOK_WIKI_KV binding not available" });
    }
    
    const encryptedDataArrayBuffer = await env.NOTEBOOK_WIKI_KV.get(`upload:${safeName}`, { type: "arrayBuffer" });
    if (!encryptedDataArrayBuffer) {
      return res.status(404).json({ error: "File not found" });
    }
    
    const encryptedData = Buffer.from(encryptedDataArrayBuffer);
    const decryptedData = decryptBuffer(encryptedData, masterKey);
    
    const ext = path.extname(safeName).toLowerCase();
    let contentType = "application/octet-stream";
    if (ext === ".png") contentType = "image/png";
    else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";
    else if (ext === ".gif") contentType = "image/gif";
    else if (ext === ".webp") contentType = "image/webp";
    else if (ext === ".svg") contentType = "image/svg+xml";
    else if (ext === ".mp3") contentType = "audio/mpeg";
    else if (ext === ".wav") contentType = "audio/wav";
    else if (ext === ".ogg") contentType = "audio/ogg";
    else if (ext === ".m4a") contentType = "audio/mp4";
    else if (ext === ".mp4") contentType = "video/mp4";
    else if (ext === ".webm") contentType = "video/webm";
    
    res.setHeader("Content-Type", contentType);
    res.send(decryptedData);
  } catch (err: any) {
    console.error("File decryption or delivery failed:", err);
    res.status(500).json({ error: "ファイルの復号または配信に失敗しました" });
  }
});

// 7.11. API Auth: Rotate/Regenerate API Key
app.post("/api/auth/rotate-api-key", requireAuth, (req: any, res) => {
  const { userId, masterKey } = req.session;

  if (!masterKey) {
    return res.status(400).json({ error: "マスターキーがセッションに存在しません。一度ログアウトして再ログインしてください。" });
  }

  const db = readDB();
  const userIndex = db.users.findIndex((u: any) => u.id === userId);
  if (userIndex === -1) {
    return res.status(404).json({ error: "ユーザーが見つかりません" });
  }

  const user = db.users[userIndex];
  const newApiKey = "api_key_" + crypto.randomBytes(16).toString("hex");
  const salt = Buffer.from(user.saltHex, "hex");

  try {
    // Encrypt user's master key using the new API Key
    const apiDerivedKey = deriveKey(newApiKey, salt);
    const encryptedMasterKeyApi = encrypt(masterKey.toString("hex"), apiDerivedKey);

    // Update user record
    db.users[userIndex] = {
      ...user,
      apiKey: newApiKey,
      encryptedMasterKeyApi,
    };

    writeDB(db);

    res.json({ success: true, apiKey: newApiKey });
  } catch (err: any) {
    console.error("Failed to rotate API Key:", err);
    res.status(500).json({ error: "APIキーの再生成に失敗しました: " + (err.message || String(err)) });
  }
});

// 7.12. Memo Endpoint: Fetch content from a URL (webpage or direct file) and analyze it
app.post("/api/memos/fetch-url", requireAuth, async (req: any, res: any) => {
  const { userId, masterKey } = req.session;
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    // Validate URL protocol
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return res.status(400).json({ error: "HTTP または HTTPS プロトコルのURLのみ対応しています。" });
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok) {
      throw new Error(`URLの取得に失敗しました: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "text/plain";
    const mimeType = contentType.split(";")[0].trim().toLowerCase();

    // Check if it's text-based
    const isText = mimeType.startsWith("text/") || 
                   mimeType === "application/json" || 
                   mimeType === "application/javascript" ||
                   mimeType === "application/xml" ||
                   mimeType.includes("xml") ||
                   mimeType.includes("rss") ||
                   mimeType.includes("atom") ||
                   mimeType.includes("json") ||
                   mimeType.includes("csv");

    const db = readDB();
    const user = db.users.find((u: any) => u.id === userId);
    let provider = user?.aiProvider || "gemini";
    let apiKey = getUserAiApiKey(user, masterKey) || process.env.GEMINI_API_KEY || "dummy";
    let model = user?.aiModel || "gemini-3.5-flash";
    let endpoint = user?.aiEndpoint || "https://api.openai.com/v1";

    const fileName = url.split("/").pop() || "downloaded_file";

    if (isText) {
      const rawText = await response.text();
      
      const isRss = mimeType.includes("xml") || 
                    url.endsWith(".rss") || 
                    url.endsWith(".xml") || 
                    url.includes("/feed") || 
                    /<\?xml|<rss|<feed|<channel|<entry|<item/i.test(rawText.slice(0, 3000));

      if (isRss) {
        let resultText = "";
        const rssSystemPrompt = "You are an expert RSS/Atom feed summarizer. Your task is to parse the provided XML/RSS feed content, extract the feed details (such as title, description, link) and the latest entries/items (each with title, link, publish date, and a concise Japanese summary of its content). Format the entire digest into beautifully structured Japanese Markdown. Use clear headings, bullet points, and markdown links [Title](URL) so the user can easily click through. Do not output any XML code, meta-commentary, or introductory remarks; output ONLY the formatted Markdown digest.";

        if (provider === "gemini") {
          let userAi = ai;
          const finalApiKey = getUserAiApiKey(user, masterKey) || process.env.GEMINI_API_KEY;
          if (finalApiKey) {
            userAi = new GoogleGenAI({
              apiKey: finalApiKey,
              httpOptions: { headers: { "User-Agent": "aistudio-build" } },
            });
          }

          const geminiRes = await safeGenerateContent(userAi, {
            model: model,
            contents: `${rssSystemPrompt}\n\nFeed Content:\n${rawText.slice(0, 50000)}`,
          });
          resultText = geminiRes?.text?.trim() || "";
        } else {
          // OpenAI-compatible fallback
          const cleanEndpoint = endpoint.trim().replace(/\/+$/, "");
          const resApi = await fetch(`${cleanEndpoint}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: "system", content: rssSystemPrompt },
                { role: "user", content: `Feed Content:\n${rawText.slice(0, 30000)}` }
              ]
            })
          });

          if (resApi.ok) {
            const data = await resApi.json();
            resultText = data?.choices?.[0]?.message?.content?.trim() || "";
          } else {
            resultText = "RSSフィードの解析に失敗しました。以下は生のデータの一部です:\n\n```xml\n" + rawText.slice(0, 2000) + "\n```";
          }
        }
        return res.json({ success: true, text: resultText, isHtml: false, isRss: true, mimeType });
      } else if (mimeType.includes("html")) {
        let resultText = "";
        const systemPrompt = "You are an expert web content extractor. Your task is to strip away all website boilerplate (like navigation menus, headers, footers, advertisement banners, social sharing buttons, sidebar links) from the provided HTML, and output ONLY the primary, high-value article/content body, cleanly structured and formatted in beautiful Japanese Markdown. Do not include any meta-introductions or preambles, just output the extracted content.";

        if (provider === "gemini") {
          let userAi = ai;
          const finalApiKey = getUserAiApiKey(user, masterKey) || process.env.GEMINI_API_KEY;
          if (finalApiKey) {
            userAi = new GoogleGenAI({
              apiKey: finalApiKey,
              httpOptions: { headers: { "User-Agent": "aistudio-build" } },
            });
          }

          const geminiRes = await safeGenerateContent(userAi, {
            model: model,
            contents: `${systemPrompt}\n\nHTML Content:\n${rawText.slice(0, 50000)}`,
          });
          resultText = geminiRes?.text?.trim() || "";
        } else {
          // OpenAI-compatible fallback
          const cleanEndpoint = endpoint.trim().replace(/\/+$/, "");
          const resApi = await fetch(`${cleanEndpoint}/chat/completions`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: model,
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `HTML Content:\n${rawText.slice(0, 30000)}` }
              ]
            })
          });

          if (resApi.ok) {
            const data = await resApi.json();
            resultText = data?.choices?.[0]?.message?.content?.trim() || "";
          } else {
            resultText = rawText.slice(0, 3000).replace(/<[^>]*>/g, ""); // basic fallback strip html
          }
        }
        return res.json({ success: true, text: resultText, isHtml: true, mimeType });
      } else {
        // Plain text, JSON, CSV, etc.
        return res.json({ success: true, text: rawText, isHtml: false, mimeType });
      }
    } else {
      // It is a binary file (Image, PDF, Audio, Video). Read as buffer and pass to multimodal analyzer.
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileData = buffer.toString("base64");

      let prompt = "";
      if (mimeType.startsWith("image/")) {
        prompt = `画像をOCR（文字認識）して分析し、画像に含まれるすべてのテキストを抽出するか、または画像の内容・レイアウトを、詳細で読みやすい日本語のMarkdown形式で記述してください。
メタな解説や挨拶、前置き、後書きは一切含めず、抽出・分析されたMarkdownテキストのみを出力してください。`;
      } else if (mimeType.startsWith("audio/")) {
        prompt = `この音声ファイルを正確に日本語で文字起こし（トランスクリプト）してください。
複数の話者がいる場合は、綺麗な対話/スクリプト形式（Markdown）に整形してください。
メタな解説や挨拶、前置き、後書きは一切含めず、文字起こしテキストのみを出力してください。`;
      } else if (mimeType.startsWith("video/")) {
        prompt = `この動画ファイルを分析し、話されている音声を日本語で文字起こしした上で、動画に映っている主要な視覚的イベントやテキスト、動きをわかりやすいMarkdown形式のノートにまとめてください。
メタな解説や挨拶、前置き、後書きは一切含めず、分析と文字起こしのMarkdownテキストのみを出力してください。`;
      } else if (mimeType.includes("pdf") || mimeType === "application/pdf") {
        prompt = `このPDFドキュメントを読み込み、含まれるすべてのテキストや重要な情報を抽出して、綺麗に構造化された日本語のMarkdown形式に変換してください。
メタな解説や挨拶、前置き、後書きは一切含めず、抽出されたMarkdownテキストのみを出力してください。`;
      } else {
        prompt = `このファイルを分析し、抽出した内容を綺麗に整形された日本語のMarkdown形式で出力してください。
メタな解説や挨拶、前置き、後書きは一切含めず、結果のみを出力してください。`;
      }

      let resultText = "";
      let activeProvider = provider;
      let activeApiKey = apiKey;
      let activeModel = model;

      if (activeProvider !== "gemini" && !mimeType.startsWith("image/")) {
        activeProvider = "gemini";
        activeApiKey = process.env.GEMINI_API_KEY || "dummy";
        activeModel = "gemini-3.5-flash";
      }

      if (activeProvider === "gemini") {
        let userAi = ai;
        const finalApiKey = getUserAiApiKey(user, masterKey) || process.env.GEMINI_API_KEY;
        if (finalApiKey) {
          userAi = new GoogleGenAI({
            apiKey: finalApiKey,
            httpOptions: { headers: { "User-Agent": "aistudio-build" } },
          });
        }

        const filePart = {
          inlineData: {
            mimeType: mimeType,
            data: fileData,
          },
        };

        const responseAI = await safeGenerateContent(userAi, {
          model: activeModel,
          contents: { parts: [filePart, { text: prompt }] },
        });

        resultText = responseAI?.text?.trim() || "";
      } else {
        const cleanEndpoint = endpoint.trim().replace(/\/+$/, "");
        let messages: any[] = [];

        if (mimeType.startsWith("image/")) {
          messages = [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:${mimeType};base64,${fileData}`
                  }
                }
              ]
            }
          ];
        } else {
          messages = [
            {
              role: "user",
              content: `${prompt}\n\n[ファイル名: ${fileName}, ファイルタイプ: ${mimeType}]`
            }
          ];
        }

        const resApi = await fetch(`${cleanEndpoint}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${activeApiKey}`
          },
          body: JSON.stringify({
            model: activeModel,
            messages: messages
          })
        });

        if (!resApi.ok) {
          const errorText = await resApi.text();
          throw new Error(`OpenAI API Error: ${errorText}`);
        }

        const data = await resApi.json();
        resultText = data?.choices?.[0]?.message?.content?.trim() || "";
      }

      res.json({ success: true, text: resultText, isHtml: false, mimeType });
    }
  } catch (err: any) {
    console.error("URL fetch and analysis failed:", err);
    res.status(500).json({ error: "URLの取得または解析に失敗しました: " + (err.message || String(err)) });
  }
});

// 8. Memo Endpoint: Delete Memo
app.delete("/api/memos/:id", requireAuth, (req: any, res) => {
  const { userId } = req.session;
  const { id } = req.params;

  const db = readDB();
  const index = db.memos.findIndex((m: any) => m.id === id && m.userId === userId);
  if (index === -1) {
    return res.status(404).json({ error: "Memo not found" });
  }

  db.memos.splice(index, 1);
  writeDB(db);

  res.json({ success: true });
});

// 9. External API Endpoint: Register Memo using x-api-key
app.post("/api/external/memos", async (req, res) => {
  const apiKey = req.headers["x-api-key"] as string;
  if (!apiKey) {
    return res.status(401).json({ error: "Unauthorized: Missing x-api-key header" });
  }

  const db = readDB();
  const user = db.users.find((u: any) => u.apiKey === apiKey);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
  }

  const { title, content } = req.body;
  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }

  // Decrypt user master key using API Key
  let masterKey: Buffer;
  try {
    const salt = Buffer.from(user.saltHex, "hex");
    const apiDerivedKey = deriveKey(user.apiKey, salt);
    const decryptedHex = decrypt(user.encryptedMasterKeyApi, apiDerivedKey);
    masterKey = Buffer.from(decryptedHex, "hex");
  } catch (err) {
    return res.status(500).json({ error: "Decryption of user master key failed" });
  }

  const existingMemos = db.memos
    .filter((m: any) => m.userId === user.id)
    .map((m: any) => ({ id: m.id, title: m.title, tags: m.tags || [] }));

  const targetId = crypto.randomUUID();
  const metadata = await generateMemoMetadata(title, content || "", user.id, targetId, existingMemos, masterKey);

  const encryptedContent = encrypt(content || "", masterKey);
  const now = new Date().toISOString();

  const savedMemo = {
    id: targetId,
    userId: user.id,
    title,
    encryptedContent,
    tags: metadata.tags,
    relatedMemoIds: metadata.relatedMemoIds,
    summary: metadata.summary,
    createdAt: now,
    updatedAt: now,
  };

  db.memos.push(savedMemo);
  writeDB(db);

  res.json({
    id: targetId,
    title,
    content: content || "",
    tags: metadata.tags,
    relatedMemoIds: metadata.relatedMemoIds,
    summary: metadata.summary,
    createdAt: now,
    updatedAt: now,
  });
});

// ============================================================================
// Google Drive Integration & OAuth Endpoints
// ============================================================================

// Help construct redirect URI robustly
function getGoogleRedirectUri(req: any): string {
  const host = req.get("host") || "localhost:3000";
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https" || host.includes(".run.app");
  const protocol = isHttps ? "https" : "http";
  return `${protocol}://${host}/auth/google/callback`;
}

// 10. Google Drive OAuth URL Generation
app.get("/api/auth/google/url", (req: any, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.CLIENT_ID || "";
  if (!clientId) {
    return res.status(500).json({ error: "Google OAuth Client ID is not configured in environment." });
  }

  const redirectUri = getGoogleRedirectUri(req);
  const scopes = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.readonly",
  ].join(" ");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
  });

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  res.json({ url });
});

// 11. Google Drive OAuth Callback Handler
app.get(["/auth/google/callback", "/auth/google/callback/"], async (req: any, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #fef2f2; color: #991b1b; padding: 20px; text-align: center;">
          <div>
            <h2 style="margin-bottom: 10px;">連携エラー</h2>
            <p>${error}</p>
            <button onclick="window.close()" style="margin-top: 15px; padding: 8px 16px; background-color: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">閉じる</button>
          </div>
        </body>
      </html>
    `);
  }

  if (!code) {
    return res.status(400).send("Authorization code is missing");
  }

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.CLIENT_ID || "";
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.CLIENT_SECRET || "";
    const redirectUri = getGoogleRedirectUri(req);

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code as string,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", tokenData);
      return res.status(tokenResponse.status).send(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
    }

    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f0fdf4; color: #166534; padding: 20px; text-align: center;">
          <div>
            <svg style="width: 48px; height: 48px; color: #22c55e; margin-bottom: 10px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <h2 style="margin-bottom: 10px;">Google Drive 連携完了</h2>
            <p style="font-size: 14px; color: #4b5563;">認証が成功しました。このウィンドウは自動的に閉じます。</p>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'GOOGLE_OAUTH_SUCCESS', tokenData: ${JSON.stringify(tokenData)} }, '*');
                setTimeout(() => window.close(), 1000);
              } else {
                document.write("<p style='margin-top: 15px;'>このウィンドウを閉じて、LLM Wikiに戻ってください。</p>");
              }
            </script>
          </div>
        </body>
      </html>
    `);
  } catch (err: any) {
    console.error("OAuth callback error:", err);
    res.status(500).send("Internal server error during OAuth flow");
  }
});

// 12. Google Drive Proxy: List Files
app.post("/api/google/drive/list", requireAuth, async (req: any, res) => {
  const { googleAccessToken } = req.body;
  if (!googleAccessToken) {
    return res.status(400).json({ error: "Google access token is required" });
  }

  try {
    const driveRes = await fetch(
      "https://www.googleapis.com/drive/v3/files?q=mimeType%3D'text%2Fplain'&fields=files(id%2Cname%2CmimeType%2CcreatedTime%2CmodifiedTime)&pageSize=100",
      {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
      }
    );

    const data = await driveRes.json();
    if (!driveRes.ok) {
      return res.status(driveRes.status).json({ error: data.error?.message || "Google Drive listing failed" });
    }

    res.json(data);
  } catch (err: any) {
    console.error("Proxy Drive list failed:", err);
    res.status(500).json({ error: err.message || "Proxy listing error" });
  }
});

// 13. Google Drive Proxy: Load File Content
app.post("/api/google/drive/load", requireAuth, async (req: any, res) => {
  const { googleAccessToken, fileId } = req.body;
  if (!googleAccessToken || !fileId) {
    return res.status(400).json({ error: "Google access token and fileId are required" });
  }

  try {
    // Fetch Metadata to get the actual name
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });
    const metadata = await metaRes.json();

    if (!metaRes.ok) {
      return res.status(metaRes.status).json({ error: metadata.error?.message || "Failed to load metadata" });
    }

    // Fetch actual media content
    const contentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${googleAccessToken}` },
    });

    if (!contentRes.ok) {
      const errText = await contentRes.text();
      return res.status(contentRes.status).json({ error: errText || "Failed to download content" });
    }

    const content = await contentRes.text();
    res.json({
      id: fileId,
      name: metadata.name,
      content,
    });
  } catch (err: any) {
    console.error("Proxy Drive load failed:", err);
    res.status(500).json({ error: err.message || "Proxy loading error" });
  }
});

// 14. Google Drive Proxy: Save File Content (Create or Update)
app.post("/api/google/drive/save", requireAuth, async (req: any, res) => {
  const { googleAccessToken, filename, content, fileId } = req.body;
  if (!googleAccessToken || !filename) {
    return res.status(400).json({ error: "Google access token and filename are required" });
  }

  try {
    if (fileId) {
      // Update existing file content
      const updateRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          "Content-Type": "text/plain",
        },
        body: content || "",
      });

      const data = await updateRes.json();
      if (!updateRes.ok) {
        return res.status(updateRes.status).json({ error: data.error?.message || "Google Drive file update failed" });
      }

      return res.json({ success: true, fileId, name: filename });
    } else {
      // Create a brand new file using Multipart upload
      const boundary = "llm_wiki_drive_boundary";
      const fileMetadata = {
        name: filename,
        mimeType: "text/plain",
      };

      const body = [
        `--${boundary}`,
        "Content-Type: application/json; charset=UTF-8",
        "",
        JSON.stringify(fileMetadata),
        `--${boundary}`,
        "Content-Type: text/plain; charset=UTF-8",
        "",
        content || "",
        `--${boundary}--`,
      ].join("\r\n");

      const createRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      });

      const data = await createRes.json();
      if (!createRes.ok) {
        return res.status(createRes.status).json({ error: data.error?.message || "Google Drive file creation failed" });
      }

      return res.json({ success: true, fileId: data.id, name: data.name });
    }
  } catch (err: any) {
    console.error("Proxy Drive save failed:", err);
    res.status(500).json({ error: err.message || "Proxy saving error" });
  }
});

// Export the handler for Cloudflare Workers / Pages Functions
export default httpServerHandler(app);
