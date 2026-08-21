'use client';

export function buildPptBrowserSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${query.trim()} PPT`)}`;
}

export function openPptBrowserSearch(query: string): Window | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  return window.open(buildPptBrowserSearchUrl(trimmed), '_blank', 'noopener,noreferrer');
}
