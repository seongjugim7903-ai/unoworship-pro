import { ShieldCheck } from 'lucide-react';

type CopyrightComplianceNoticeProps = {
  className?: string;
  compact?: boolean;
  tone?: 'light' | 'dark';
};

export default function CopyrightComplianceNotice({
  className = '',
  compact = false,
  tone = 'light',
}: CopyrightComplianceNoticeProps) {
  const dark = tone === 'dark';

  return (
    <div
      className={[
        'rounded-lg border',
        compact ? 'px-3 py-2' : 'px-4 py-3',
        dark
          ? 'border-amber-400/20 bg-amber-300/10 text-amber-100'
          : 'border-amber-200 bg-amber-50 text-amber-950',
        className,
      ].join(' ')}
    >
      <div className="flex items-start gap-2.5">
        <ShieldCheck
          size={compact ? 15 : 17}
          className={dark ? 'mt-0.5 shrink-0 text-amber-200' : 'mt-0.5 shrink-0 text-amber-700'}
        />
        <div className="min-w-0">
          <p className={compact ? 'text-[11px] font-bold' : 'text-[12px] font-bold'}>
            저작권 사용 권한 안내
          </p>
          <p
            className={[
              compact ? 'mt-0.5 text-[10px] leading-4' : 'mt-1 text-[11px] leading-5',
              dark ? 'text-amber-100/90' : 'text-amber-900',
            ].join(' ')}
          >
            UnoWorship은 교회가 보유하거나 사용 허가를 받은 찬양 자료를 예배 화면으로 편집·송출하는 도구입니다.
            찬양곡 가사, 악보, 음원, 녹화 및 온라인 송출에 대한 저작권 사용 권한은 각 교회가 확인해야 합니다.
            CCLI 또는 권리자 허가 정보를 등록하면 곡별 저작권 관리가 가능합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
