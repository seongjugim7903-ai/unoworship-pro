export function AdminStatePanel({
  tone,
  title,
  body,
}: {
  tone: 'amber' | 'red' | 'slate';
  title: string;
  body: string;
}) {
  const className =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-700'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : 'border-slate-200 bg-white text-slate-700';

  return (
    <div className={`rounded-lg border p-6 text-sm font-semibold leading-6 ${className}`}>
      <div className="text-base font-black">{title}</div>
      <p className="mt-2">{body}</p>
    </div>
  );
}
