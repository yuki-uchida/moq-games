export function environmentTrialFromURL(url: URL): boolean {
  return url.searchParams.get('environment-art') === '3d'
}
