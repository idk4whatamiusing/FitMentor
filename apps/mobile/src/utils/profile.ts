import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Profile} from '@fitmentor/shared';

const KEY = 'fitmentor.profile.v1';

export async function loadProfile(): Promise<Profile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

export async function saveProfile(p: Profile): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(p));
}
