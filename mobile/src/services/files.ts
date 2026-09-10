import * as DocumentPicker from 'expo-document-picker';
import { File, Paths, Directory } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { randomUUID } from 'expo-crypto';

export async function readUserFile(): Promise<{ name: string; text: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  const file = new File(asset.uri);
  try {
    if ((asset.size ?? file.size ?? 0) > 30000000) throw new Error('Máximo de 30 MB por ficheiro.');
    return { name: asset.name, text: await file.text() };
  } finally {
    // Only the picker-created cache copy, never the original user document.
    if (asset.uri.startsWith(Paths.cache.uri) && file.exists) file.delete();
  }
}
export async function shareEncryptedBackup(text: string): Promise<void> {
  if (!await Sharing.isAvailableAsync()) throw new Error('A partilha de ficheiros não está disponível.');
  const dir = new Directory(Paths.cache, 'money-os-export');
  dir.create({ idempotent: true });
  const file = new File(dir, `money-os-${randomUUID()}.moneyos`);
  try {
    file.write(text);
    await Sharing.shareAsync(file.uri, { mimeType: 'application/octet-stream', dialogTitle: 'Guardar backup cifrado do Money OS' });
  } finally { if (file.exists) file.delete(); }
}
export function clearTemporaryFiles(): void {
  for (const name of ['money-os-export', 'DocumentPicker']) {
    const directory = new Directory(Paths.cache, name);
    if (directory.exists) directory.delete();
  }
}
