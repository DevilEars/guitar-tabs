export interface PickedFile { name: string; text: string }

export const fileExportSupported = true;

export function pickTextFile(accept: string): Promise<PickedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.setAttribute('data-testid', 'file-input');
    input.style.display = 'none';
    input.onchange = async () => {
      const f = input.files?.[0];
      input.remove();
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    input.oncancel = () => { input.remove(); resolve(null); };
    document.body.appendChild(input);
    input.click();
  });
}

export async function saveFile(name: string, data: Uint8Array | string, mime: string): Promise<void> {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
