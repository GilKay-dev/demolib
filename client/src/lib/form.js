export const inputClass = 'mt-1 w-full rounded border border-slate-300 px-3 py-2'

// Thuộc tính a11y cho input: liên kết label, báo lỗi, trỏ tới thông báo lỗi
export const fieldProps = (errors, name) => ({
  id: name,
  'aria-invalid': !!errors[name],
  'aria-describedby': errors[name] ? `${name}-error` : undefined,
})
