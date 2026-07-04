import type { RepoDataset, RepoListing } from '../core/schema';

export async function fetchRepos(): Promise<RepoListing[]> {
  const res = await fetch('/api/repos');
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchDataset(path: string): Promise<RepoDataset> {
  const res = await fetch(`/api/extract?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
