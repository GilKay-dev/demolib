export function Field({ id, label, error, children }) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">{label}</label>
      {children}
      {error && <span id={`${id}-error`} role="alert" className="mt-1 block text-sm text-red-600">{error}</span>}
    </div>
  )
}
