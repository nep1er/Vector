const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_INPUT_BYTES = 15 * 1024 * 1024;
const AVATAR_SIZE = 256;

/** Вырезает из картинки квадрат по центру и уменьшает до 256×256 (PNG). */
export async function prepareAvatar(file: File): Promise<Blob> {
  if (!ALLOWED.includes(file.type)) throw new Error('Выберите изображение PNG, JPEG или WebP');
  if (file.size > MAX_INPUT_BYTES) throw new Error('Файл слишком большой (максимум 15 МБ)');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Не удалось прочитать изображение');
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Не удалось обработать изображение');

  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Не удалось обработать изображение'))),
      'image/png',
    ),
  );
}
