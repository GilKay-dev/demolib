import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Field } from '../components/Field'
import { api } from '../lib/api'
import { fieldProps, inputClass } from '../lib/form'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const FIELDS = ['email', 'name', 'password', 'confirmPassword']

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

  const a11y = (name) => fieldProps(errors, name)

  const onSubmit = async (values) => {
    setFormError('')
    try {
      const { data } = await api.post('/auth/register', values)
      setDone(data.message)
    } catch (err) {
      const fieldErrors = err.response?.data?.errors
      if (fieldErrors) {
        for (const [field, message] of Object.entries(fieldErrors)) {
          if (FIELDS.includes(field)) setError(field, { message })
          else setFormError(message)
        }
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
        <Field id="email" label="Email" error={errors.email?.message}>
          <input
            type="email"
            {...a11y('email')}
            className={inputClass}
            {...register('email', {
              required: 'Email không được để trống',
              pattern: { value: EMAIL_RE, message: 'Email không hợp lệ' },
            })}
          />
        </Field>
        <Field id="name" label="Tên" error={errors.name?.message}>
          <input
            {...a11y('name')}
            className={inputClass}
            {...register('name', {
              validate: (v) => v.trim() !== '' || 'Tên không được để trống',
              maxLength: { value: 50, message: 'Tên tối đa 50 ký tự' },
            })}
          />
        </Field>
        <Field id="password" label="Mật khẩu" error={errors.password?.message}>
          <input
            type="password"
            {...a11y('password')}
            className={inputClass}
            {...register('password', {
              required: 'Mật khẩu không được để trống',
              deps: ['confirmPassword'],
              minLength: { value: 8, message: 'Mật khẩu phải từ 8 đến 16 ký tự' },
              maxLength: { value: 16, message: 'Mật khẩu phải từ 8 đến 16 ký tự' },
            })}
          />
        </Field>
        <Field id="confirmPassword" label="Xác nhận mật khẩu" error={errors.confirmPassword?.message}>
          <input
            type="password"
            {...a11y('confirmPassword')}
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
