import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValueStore } from '@guitar-tabs/library';

/** AsyncStorage: SQLite-backed on Android, window.localStorage on web. */
export const asyncStorageKV: KeyValueStore = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
  removeItem: (k) => AsyncStorage.removeItem(k),
};
