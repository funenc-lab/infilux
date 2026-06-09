const NATIVE_IMAGE_CLIPBOARD_TYPES = new Set([
  'public.image',
  'public.png',
  'public.jpeg',
  'public.jpg',
  'public.tiff',
  'public.tif',
  'public.heic',
  'public.heif',
  'com.apple.pict',
  'com.apple.icns',
  'com.microsoft.bmp',
]);

export function isAgentClipboardImageTypeSignal(type: string): boolean {
  const normalizedType = type.trim().toLowerCase();
  return normalizedType.startsWith('image/') || NATIVE_IMAGE_CLIPBOARD_TYPES.has(normalizedType);
}

export function hasAgentClipboardImageSignal(clipboardData: DataTransfer): boolean {
  const types = Array.from(clipboardData.types ?? []);
  if (types.some(isAgentClipboardImageTypeSignal)) {
    return true;
  }

  const items = clipboardData.items;
  if (!items) {
    return false;
  }

  for (let index = 0; index < items.length; index += 1) {
    const itemType = items[index]?.type ?? '';
    if (isAgentClipboardImageTypeSignal(itemType)) {
      return true;
    }
  }

  return false;
}
