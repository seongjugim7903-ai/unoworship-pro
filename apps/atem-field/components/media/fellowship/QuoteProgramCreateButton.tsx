'use client';

import { useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { createQuoteProgram } from '@/lib/generators/quoteProgramGenerator';

interface QuoteProgramCreateButtonProps {
  worshipDate: string;
  templateName: string;
  quotesText: string;
}

/** 예배자막협조의 말씀찾기(인용) 필드만 독립 저장 후 컴포저로 연다. */
export default function QuoteProgramCreateButton({
  worshipDate,
  templateName,
  quotesText,
}: QuoteProgramCreateButtonProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!quotesText.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      const result = await createQuoteProgram({ worshipDate, templateName, quotesText });
      window.location.assign(`/composer?loadWorship=${encodeURIComponent(result.worshipId)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '말씀찾기(인용) 프로그램을 만들지 못했습니다.');
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void handleCreate()}
        disabled={!quotesText.trim() || saving}
        className="inline-flex h-8 items-center gap-1.5 rounded-md bg-violet-600 px-2.5 text-[11px] font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {saving && <LoaderCircle size={13} className="animate-spin" />}
        {saving ? '저장 중' : '생성 후 컴포즈 삽입'}
      </button>
      {error && <p className="max-w-56 text-right text-[10px] text-red-500">{error}</p>}
    </div>
  );
}
