/// <reference types="wicg-file-system-access" />
import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';

export interface VideoMetadata {
  id: string; // Typically the filename or a UUID
  filename: string;
  lastTime: number; // in seconds
  duration: number; // in seconds
  lastWatched: number; // timestamp
  handle: FileSystemFileHandle | null; // Null if not using FS API
}

interface VRPlayerDB extends DBSchema {
  videos: {
    key: string;
    value: VideoMetadata;
    indexes: { 'by-date': number };
  };
}

let dbPromise: Promise<IDBPDatabase<VRPlayerDB>>;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<VRPlayerDB>('vr-player-db', 1, {
      upgrade(db) {
        const store = db.createObjectStore('videos', {
          keyPath: 'id',
        });
        store.createIndex('by-date', 'lastWatched');
      },
    });
  }
  return dbPromise;
}

export async function saveVideoMetadata(metadata: VideoMetadata): Promise<void> {
  const db = await getDB();
  await db.put('videos', metadata);
}

export async function updateVideoTime(id: string, time: number, duration: number): Promise<void> {
  const db = await getDB();
  const video = await db.get('videos', id);
  if (video) {
    video.lastTime = time;
    if (duration > 0) video.duration = duration;
    video.lastWatched = Date.now();
    await db.put('videos', video);
  }
}

export async function getRecentVideos(): Promise<VideoMetadata[]> {
  const db = await getDB();
  // Get all, then sort. Alternatively use index.
  const allVideos = await db.getAllFromIndex('videos', 'by-date');
  // Return descending order (newest first)
  return allVideos.reverse();
}

export async function getVideoMetadata(id: string): Promise<VideoMetadata | undefined> {
  const db = await getDB();
  return db.get('videos', id);
}

export async function deleteVideoMetadata(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('videos', id);
}

// Check if browser supports File System Access API
export const supportsFileSystemAccess = 'showOpenFilePicker' in window;
