/** Download a file. Browsers download large data: URLs unreliably, so always convert to a Blob URL */
export async function download(url: string, filename: string) {
  const href = url.startsWith('data:') ? URL.createObjectURL(await (await fetch(url)).blob()) : url;
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
