export async function confirmAsync(title: string, message: string, _confirmLabel = 'OK'): Promise<boolean> {
  return window.confirm(`${title}\n\n${message}`);
}
