export function SkeletonMessage() {
  return (
    <div className="rounded-xl px-4 py-3 max-w-2xl bg-white border border-slate-200 self-start animate-pulse shadow-sm">
      <div className="h-3 w-16 bg-slate-200 rounded-full mb-3" />
      <div className="space-y-2">
        <div className="h-2.5 bg-slate-200 rounded-full w-56" />
        <div className="h-2.5 bg-slate-200 rounded-full w-72" />
        <div className="h-2.5 bg-slate-200 rounded-full w-64" />
      </div>
    </div>
  );
}

