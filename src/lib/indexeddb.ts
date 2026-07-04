"use client";
import type { Song } from "@/types/voicehub";

/**
 * 播放历史 indexedDB 封装。
 *
 * 数据库：voicecity-lite
 * 对象仓库：
 *   - play-history（keyPath = "id"）— 播放过的歌（Song + playedAt + favorited）
 *   - favorites（keyPath = "id"）— 收藏的歌（Song + favoritedAt）
 *
 * 排序规则（读取历史时）：
 *   1. 收藏的歌曲居顶，按 playedAt 倒序
 *   2. 未收藏的歌曲按 playedAt 倒序
 *
 * 收藏歌曲独立存储在 favorites 仓库，清空全部历史不会删除收藏。
 */

const DB_NAME = "voicecity-lite";
const DB_VERSION = 2;
const HISTORY_STORE = "play-history";
const FAVORITES_STORE = "favorites";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前环境不支持 indexedDB"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(HISTORY_STORE)) {
        db.createObjectStore(HISTORY_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(FAVORITES_STORE)) {
        db.createObjectStore(FAVORITES_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** 添加 / 更新一条播放历史（同一首歌 id 覆盖，playedAt 刷新为最新时间） */
export async function addPlayHistory(song: Song): Promise<void> {
  const db = await openDB();
  // 先读取现有记录，保留 favorited 状态
  const existing = await new Promise<Song | undefined>((resolve) => {
    const tx = db.transaction(HISTORY_STORE, "readonly");
    const r = tx.objectStore(HISTORY_STORE).get(song.id);
    r.onsuccess = () => resolve(r.result as Song | undefined);
    r.onerror = () => resolve(undefined);
  });
  const record: Song = {
    ...song,
    playedAt: new Date().toISOString(),
    favorited: existing?.favorited ?? false,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, "readwrite");
    tx.objectStore(HISTORY_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 读取全部播放历史，按规则排序：收藏居顶，各部分内按 playedAt 倒序 */
export async function getPlayHistory(): Promise<Song[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, "readonly");
    const req = tx.objectStore(HISTORY_STORE).getAll();
    req.onsuccess = () => {
      const all = (req.result as Song[]) ?? [];
      const favorites = all.filter((s) => s.favorited);
      const normal = all.filter((s) => !s.favorited);
      const sortByPlayedAt = (a: Song, b: Song) => {
        const ta = a.playedAt ? new Date(a.playedAt).getTime() : 0;
        const tb = b.playedAt ? new Date(b.playedAt).getTime() : 0;
        return tb - ta;
      };
      favorites.sort(sortByPlayedAt);
      normal.sort(sortByPlayedAt);
      resolve([...favorites, ...normal]);
    };
    req.onerror = () => reject(req.error);
  });
}

/** 删除一条播放历史 */
export async function deletePlayHistory(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, "readwrite");
    tx.objectStore(HISTORY_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 清空全部未收藏的播放历史（保留收藏的歌曲） */
export async function clearPlayHistory(): Promise<void> {
  const db = await openDB();
  const all = await getPlayHistory();
  const toDelete = all.filter((s) => !s.favorited);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HISTORY_STORE, "readwrite");
    const store = tx.objectStore(HISTORY_STORE);
    for (const s of toDelete) {
      store.delete(s.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ============ 收藏功能（独立于历史，清空历史不影响收藏） ============

/** 收藏一首歌（写入 favorites 仓库，并在历史记录中标记 favorited=true） */
export async function favoriteSong(song: Song): Promise<void> {
  const db = await openDB();
  const favRecord: Song = { ...song, favorited: true, favoritedAt: new Date().toISOString() };
  return new Promise((resolve, reject) => {
    const tx = db.transaction([FAVORITES_STORE, HISTORY_STORE], "readwrite");
    // 写入收藏仓库
    tx.objectStore(FAVORITES_STORE).put(favRecord);
    // 如果历史里也有这首歌，标记 favorited=true
    const histStore = tx.objectStore(HISTORY_STORE);
    const getReq = histStore.get(song.id);
    getReq.onsuccess = () => {
      if (getReq.result) {
        const existing = getReq.result as Song;
        histStore.put({ ...existing, favorited: true });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 取消收藏一首歌（从 favorites 仓库删除，并在历史记录中标记 favorited=false） */
export async function unfavoriteSong(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([FAVORITES_STORE, HISTORY_STORE], "readwrite");
    tx.objectStore(FAVORITES_STORE).delete(id);
    const histStore = tx.objectStore(HISTORY_STORE);
    const getReq = histStore.get(id);
    getReq.onsuccess = () => {
      if (getReq.result) {
        const existing = getReq.result as Song;
        histStore.put({ ...existing, favorited: false });
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** 判断一首歌是否已收藏 */
export async function isFavorited(id: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FAVORITES_STORE, "readonly");
    const r = tx.objectStore(FAVORITES_STORE).get(id);
    r.onsuccess = () => resolve(!!r.result);
    r.onerror = () => reject(r.error);
  });
}

/** 删除一首收藏的歌（同时从 favorites 和 play-history 中删除） */
export async function deleteFavorite(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([FAVORITES_STORE, HISTORY_STORE], "readwrite");
    tx.objectStore(FAVORITES_STORE).delete(id);
    tx.objectStore(HISTORY_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
