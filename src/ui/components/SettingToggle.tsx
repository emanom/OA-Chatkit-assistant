interface SettingToggleProps {
  id: string;
  label: string;
  helper?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

export function SettingToggle({
  id,
  label,
  helper,
  checked,
  disabled,
  onChange,
}: SettingToggleProps) {
  return (
    <div className="flex items-start gap-3 select-none">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 mt-0.5 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-400 disabled:opacity-40"
      />
      <label htmlFor={id} className="cursor-pointer">
        <span className="text-sm font-medium text-slate-100">{label}</span>
        {helper ? (
          <p className="text-xs text-slate-400 mt-1.5 leading-snug">{helper}</p>
        ) : null}
      </label>
    </div>
  );
}

