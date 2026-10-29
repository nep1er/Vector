/** 1536 → «1,5 КБ» */
export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} Б`;
  const units = ['КБ', 'МБ', 'ГБ'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0).replace('.', ',')} ${units[i]}`;
}

export const MAX_UPLOAD_MB = 25;
export const tooBig = (file: File) => file.size > MAX_UPLOAD_MB * 1024 * 1024;
