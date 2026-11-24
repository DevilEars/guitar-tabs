import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

export interface PickedFile { name: string; text: string }

export const fileExportSupported = true;

/** Android: system document picker, then read the cached copy. (Not yet run on a device.) */
export async function pickTextFile(_accept: string): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false, type: '*/*' });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  return { name: asset.name, text: await new File(asset.uri).text() };
}

/** Android: write to the cache directory and open the share sheet. (Not yet run on a device.) */
export async function saveFile(name: string, data: Uint8Array | string, mime: string): Promise<void> {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  file.write(data);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri, { mimeType: mime, dialogTitle: name });
}
