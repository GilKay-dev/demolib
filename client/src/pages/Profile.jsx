import dayjs from 'dayjs'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Field } from '../components/Field'
import { useAuth } from '../context/AuthContext'
import { api } from '../lib/api'
import { fieldProps, inputClass } from '../lib/form'

const PHONE_RE = /^0[0-9]{9}$/
const PROFILE_FIELDS = ['name', 'phone', 'address']
const PASSWORD_FIELDS = ['currentPassword', 'newPassword', 'confirmPassword']
const PASSWORD_RANGE = 'Mật khẩu phải từ 8 đến 16 ký tự'

const formatMoney = (n) => `${n.toLocaleString('vi-VN')} ₫`

// Lỗi field từ server: field có trên form thì gắn vào field, còn lại hiện ở dòng lỗi chung
function applyServerErrors(err, fields, setError, setFormError, fallback) {
  const data = err.response?.data
  if (data?.errors) {
    for (const [field, message] of Object.entries(data.errors)) {
      if (fields.includes(field)) setError(field, { message })
      else setFormError(message)
    }
  } else {
    setFormError(data?.message ?? fallback)
  }
}

function ProfileForm({ profile, onSaved, onCancel }) {
  const [formError, setFormError] = useState('')
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { name: profile.name, phone: profile.phone ?? '', address: profile.address ?? '' } })

  const onSubmit = async (values) => {
    setFormError('')
    try {
      const { data } = await api.put('/me', values)
      onSaved(data)
    } catch (err) {
      applyServerErrors(err, PROFILE_FIELDS, setError, setFormError, 'Không thể cập nhật, vui lòng thử lại')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <p className="text-sm text-slate-600">Email: {profile.email} (không thể thay đổi)</p>
      <Field id="name" label="Tên" error={errors.name?.message}>
        <input
          {...fieldProps(errors, 'name')}
          className={inputClass}
          {...register('name', {
            validate: (v) => v.trim() !== '' || 'Tên không được để trống',
            maxLength: { value: 50, message: 'Tên tối đa 50 ký tự' },
          })}
        />
      </Field>
      <Field id="phone" label="Số điện thoại" error={errors.phone?.message}>
        <input
          {...fieldProps(errors, 'phone')}
          className={inputClass}
          {...register('phone', {
            validate: (v) => v.trim() === '' || PHONE_RE.test(v.trim()) || 'Số điện thoại không hợp lệ (10 chữ số, bắt đầu bằng 0)',
          })}
        />
      </Field>
      <Field id="address" label="Địa chỉ" error={errors.address?.message}>
        <input
          {...fieldProps(errors, 'address')}
          className={inputClass}
          {...register('address', {
            validate: (v) => v.trim() !== '' || 'Địa chỉ không được để trống',
            maxLength: { value: 255, message: 'Địa chỉ tối đa 255 ký tự' },
          })}
        />
      </Field>
      {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={isSubmitting} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          Lưu
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-4 py-2">
          Hủy
        </button>
      </div>
    </form>
  )
}

function PasswordForm({ onCancel }) {
  const [formError, setFormError] = useState('')
  const [done, setDone] = useState('')
  const {
    register,
    handleSubmit,
    getValues,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm()

  const onSubmit = async (values) => {
    setFormError('')
    try {
      const { data } = await api.put('/me/password', values)
      reset()
      setDone(data.message)
    } catch (err) {
      applyServerErrors(err, PASSWORD_FIELDS, setError, setFormError, 'Không thể đổi mật khẩu, vui lòng thử lại')
    }
  }

  if (done) {
    return (
      <div className="space-y-3">
        <p role="status" className="rounded bg-green-50 p-3 text-green-800">{done}</p>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-4 py-2">Đóng</button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <Field id="currentPassword" label="Mật khẩu hiện tại" error={errors.currentPassword?.message}>
        <input
          type="password"
          {...fieldProps(errors, 'currentPassword')}
          className={inputClass}
          {...register('currentPassword', { required: 'Mật khẩu hiện tại không được để trống' })}
        />
      </Field>
      <Field id="newPassword" label="Mật khẩu mới" error={errors.newPassword?.message}>
        <input
          type="password"
          {...fieldProps(errors, 'newPassword')}
          className={inputClass}
          {...register('newPassword', {
            required: 'Mật khẩu mới không được để trống',
            minLength: { value: 8, message: PASSWORD_RANGE },
            maxLength: { value: 16, message: PASSWORD_RANGE },
            validate: (v) => v !== getValues('currentPassword') || 'Mật khẩu mới phải khác mật khẩu cũ',
            deps: ['confirmPassword'],
          })}
        />
      </Field>
      <Field id="confirmPassword" label="Xác nhận mật khẩu mới" error={errors.confirmPassword?.message}>
        <input
          type="password"
          {...fieldProps(errors, 'confirmPassword')}
          className={inputClass}
          {...register('confirmPassword', {
            required: 'Mật khẩu xác nhận không được để trống',
            validate: (v) => v === getValues('newPassword') || 'Mật khẩu xác nhận không khớp',
          })}
        />
      </Field>
      {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={isSubmitting} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          Đổi mật khẩu
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-4 py-2">Hủy</button>
      </div>
    </form>
  )
}

export default function Profile() {
  const { updateUser } = useAuth()
  const [profile, setProfile] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [mode, setMode] = useState('view') // view | edit | password
  const [notice, setNotice] = useState('')

  useEffect(() => {
    api
      .get('/me')
      .then(({ data }) => setProfile(data))
      .catch(() => setLoadError('Không thể tải hồ sơ, vui lòng thử lại'))
  }, [])

  if (loadError) return <main className="mx-auto max-w-md p-8"><p role="alert" className="text-red-600">{loadError}</p></main>
  if (!profile) return <main className="mx-auto max-w-md p-8"><p>Đang tải...</p></main>

  const saved = ({ message, user }) => {
    setProfile((p) => ({ ...p, ...user }))
    updateUser({ name: user.name })
    setNotice(message)
    setMode('view')
  }

  const rows = [
    ['Tên', profile.name],
    ['Email', profile.email],
    ['Số điện thoại', profile.phone || 'Chưa cập nhật'],
    ['Địa chỉ', profile.address || 'Chưa cập nhật'],
    ['Ngày tham gia', dayjs(profile.createdAt).format('DD/MM/YYYY')],
    ['Số lần mượn', profile.borrowCount],
    ['Tổng tiền phạt', formatMoney(profile.totalFine)],
  ]

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Hồ sơ cá nhân</h1>
      {notice && <p role="status" className="mb-4 rounded bg-green-50 p-3 text-green-800">{notice}</p>}
      {mode === 'edit' && <ProfileForm profile={profile} onSaved={saved} onCancel={() => setMode('view')} />}
      {mode === 'password' && <PasswordForm onCancel={() => setMode('view')} />}
      {mode === 'view' && (
        <>
          <dl className="space-y-2">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between border-b border-slate-200 py-1">
                <dt className="text-slate-600">{label}</dt>
                <dd className="font-medium text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-6 flex gap-2">
            <button type="button" onClick={() => { setNotice(''); setMode('edit') }} className="rounded bg-slate-900 px-4 py-2 text-white">
              Cập nhật thông tin
            </button>
            <button type="button" onClick={() => { setNotice(''); setMode('password') }} className="rounded border border-slate-300 px-4 py-2">
              Đổi mật khẩu
            </button>
          </div>
        </>
      )}
    </main>
  )
}
