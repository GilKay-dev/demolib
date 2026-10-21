import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { api } from '../lib/api'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function Field({ label, error, children }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error && <span role="alert" className="mt-1 block text-sm text-red-600">{error}</span>}
    </label>
  )
}

const inputClass = 'mt-1 w-full rounded border border-slate-300 px-3 py-2'

export default function Register() {
  const [done, setDone] = useState('')
  const [formError, setFormError] = useState('')
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm()

  const onSubmit = async (values) => {
    setFormError('')
    try {
      const { data } = await api.post('/auth/register', values)
      setDone(data.message)
    } catch (err) {
      const fieldErrors = err.response?.data?.errors
      if (fieldErrors) {
        for (const [field, message] of Object.entries(fieldErrors)) setError(field, { message })
      } else {
        setFormError('Không thể đăng ký, vui lòng thử lại')
      }
    }
  }

  if (done) {
    return (
      <main className="mx-auto max-w-md p-8">
        <p role="status" className="rounded bg-green-50 p-4 text-green-800">{done}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Đăng ký</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field label="Email" error={errors.email?.message}>
          <input
            type="email"
            className={inputClass}
            {...register('email', {
              required: 'Email không được để trống',
              pattern: { value: EMAIL_RE, message: 'Email không hợp lệ' },
            })}
          />
        </Field>
        <Field label="Tên" error={errors.name?.message}>
          <input
            className={inputClass}
            {...register('name', {
              validate: (v) => v.trim() !== '' || 'Tên không được để trống',
              maxLength: { value: 50, message: 'Tên tối đa 50 ký tự' },
            })}
          />
        </Field>
        <Field label="Mật khẩu" error={errors.password?.message}>
          <input
            type="password"
            className={inputClass}
            {...register('password', {
              required: 'Mật khẩu không được để trống',
              minLength: { value: 8, message: 'Mật khẩu phải từ 8 đến 16 ký tự' },
              maxLength: { value: 16, message: 'Mật khẩu phải từ 8 đến 16 ký tự' },
            })}
          />
        </Field>
        <Field label="Xác nhận mật khẩu" error={errors.confirmPassword?.message}>
          <input
            type="password"
            className={inputClass}
            {...register('confirmPassword', {
              required: 'Mật khẩu xác nhận không được để trống',
              validate: (v) => v === getValues('password') || 'Mật khẩu xác nhận không khớp',
            })}
          />
        </Field>
        {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Đăng ký
        </button>
      </form>
    </main>
  )
}
