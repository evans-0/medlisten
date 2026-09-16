import client from './client';

export async function viewFile(path) {
  const { data, headers } = await client.get(path, { responseType: 'blob' });
  const blob = new Blob([data], { type: headers['content-type'] });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  // Revoke after a delay so the new tab has time to load the resource.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  // Let the caller show this in its own themed banner instead of a native
  // browser alert() — jarring and inconsistent with the rest of the app.
  if (!win) {
    throw new Error('Pop-up blocked — please allow pop-ups for this site and try again.');
  }
}
