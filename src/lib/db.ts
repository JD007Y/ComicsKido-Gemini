// Custom IndexedDB storage manager to bypass the limited 5MB localStorage browser quota.
// This supports hundreds of Megabytes or several Gigabytes of high-quality comic book stories!
import { ComicStory } from '../types';

const DB_NAME = 'ComicsSkidoDB';
const STORE_NAME = 'library';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error("Failed to open local comic database. Please make sure private browsing permits storage."));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function getStoredLibrary(): Promise<ComicStory[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (e) {
    console.error("IndexedDB getStoredLibrary failure, falling back to empty library", e);
    return [];
  }
}

export async function saveStoryToDB(story: ComicStory): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      // Ensure it has an ID
      if (!story.id) {
        story.id = 'comic_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      }
      
      const request = store.put(story);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (e) {
    console.error("IndexedDB saveStoryToDB failed", e);
    throw e;
  }
}

export async function deleteStoryFromDB(storyId: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(storyId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (e) {
    console.error("IndexedDB deleteStoryFromDB failed", e);
    throw e;
  }
}

export async function clearEntireLibraryFromDB(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (e) {
    console.error("IndexedDB clearEntireLibraryFromDB failed", e);
    throw e;
  }
}

// Estimates stored bytes used by calculating string lengths in IndexedDB (UTF-16 strings roughly double byte count)
export async function calculateStorageUsage(): Promise<{ usedMB: string; percent: number; isUnlimited: boolean }> {
  try {
    const stories = await getStoredLibrary();
    let totalChars = 0;
    stories.forEach(s => {
      totalChars += JSON.stringify(s).length;
    });
    
    // Convert to MB
    const bytes = totalChars * 2;
    const usedMB = (bytes / (1024 * 1024)).toFixed(2);
    
    // Browser IndexedDB allows up to 50% of free disk space (hundreds of MBs to GBs).
    // We will show a generous 500MB scale in the UI to denote premium spacious storage.
    const quotaMB = 500;
    const percent = Math.min(Math.round((parseFloat(usedMB) / quotaMB) * 100), 100);
    
    return {
      usedMB,
      percent,
      isUnlimited: true
    };
  } catch (e) {
    return { usedMB: '0.00', percent: 0, isUnlimited: true };
  }
}
