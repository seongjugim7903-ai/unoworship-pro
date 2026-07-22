// 자막 템플릿 서버 저장소 클라이언트 (조회/저장/삭제) — /api/templates 래퍼

import type { SubtitleTemplate } from './model';

export async function listTemplates(): Promise<SubtitleTemplate[]> {
  try {
    const res = await fetch('/api/templates');
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.templates) ? (data.templates as SubtitleTemplate[]) : [];
  } catch {
    return [];
  }
}

export async function saveTemplate(template: SubtitleTemplate): Promise<boolean> {
  const res = await fetch('/api/templates', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template }),
  });
  return res.ok;
}

export async function removeTemplate(id: string): Promise<boolean> {
  const res = await fetch(`/api/templates?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return res.ok;
}
