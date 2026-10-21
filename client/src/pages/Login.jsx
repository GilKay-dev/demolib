import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const inputClass = 'mt-1 w-full rounded border border-slate-300 px-3 py-2'

export default function Login() {
  const [formError, setFormError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm()

  const onSubmit = async (values) => {
    setFormError('')
    try {
      const { data } = await api.post('/auth/login', values)
      login(data)
      navigate('/')
    } catch (err) {
      const res = err.response
      if (res?.data?.errors) {
        for (const [field, message] of Object.entries(res.data.errors)) {
          if (field === 'email' || field === 'password') setError(field, { message })
          else setFormError(message)
        }
      } else {
        setFormError(res?.data?.message ?? 'Không thể đăng nhập, vui lòng thử lại')
      }
    }
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Đăng nhập</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium text-slate-700">Email</label>
          <input
            id="email"
            type="email"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className={inputClass}
            {...register('email', {
              required: 'Email không được để trống',
              pattern: { value: EMAIL_RE, message: 'Email không hợp lệ' },
            })}
          />
          {errors.email && <span id="email-error" role="alert" className="mt-1 block text-sm text-red-600">{errors.email.message}</span>}
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-medium text-slate-700">Mật khẩu</label>
          <input
            id="password"
            type="password"
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? 'password-error' : undefined}
            className={inputClass}
            {...register('password', {
              required: 'Mật khẩu không được để trống',
              minLength: { value: 8, message: 'Mật khẩu phải từ 8 đến 16 ký tự' },
              maxLength: { value: 16, message: 'Mật khẩu phải từ 8 đến 16 ký tự' },
            })}
          />
          {errors.password && <span id="password-error" role="alert" className="mt-1 block text-sm text-red-600">{errors.password.message}</span>}
        </div>
        {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        >
          Đăng nhập
        </button>
      </form>
      <p className="mt-4 text-sm text-slate-600">
        Chưa có tài khoản? <Link to="/register" className="text-blue-700 underline">Đăng ký</Link>
      </p>
    </main>
  )
}
