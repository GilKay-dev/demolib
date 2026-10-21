import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { Field } from '../components/Field'
import { api } from '../lib/api'
import { fieldProps, inputClass } from '../lib/form'
import { isValidIsbn } from '../lib/isbn'

const FIELDS = ['title', 'author', 'publishYear', 'isbn', 'categoryId', 'description', 'quantity']
const MAX_QUANTITY = 100000
const currentYear = new Date().getFullYear()
const YEAR_MESSAGE = `Năm xuất bản phải từ 1900 đến ${currentYear}`

const required = (message) => (v) => String(v).trim() !== '' || message

export default function BookCreate() {
  const [categories, setCategories] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [formError, setFormError] = useState('')
  const [created, setCreated] = useState(null)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { title: '', author: '', publishYear: '', isbn: '', categoryId: '', description: '', quantity: '' } })

  useEffect(() => {
    let ignore = false
    api
      .get('/categories')
      .then(({ data }) => !ignore && setCategories(data))
      .catch(() => !ignore && setLoadError('Không thể tải danh sách thể loại, vui lòng thử lại'))
    return () => {
      ignore = true
    }
  }, [attempt])

  const onSubmit = async (values) => {
    setFormError('')
    setCreated(null)
    try {
      const { data } = await api.post('/books', values)
      setCreated(data.book)
      reset()
    } catch (err) {
      const data = err.response?.data
      if (data?.errors) {
        const general = []
        for (const [field, message] of Object.entries(data.errors)) {
          if (FIELDS.includes(field)) setError(field, { message })
          else general.push(message)
        }
        if (general.length) setFormError(general.join('. '))
      } else {
        setFormError(data?.message ?? 'Không thể thêm sách, vui lòng thử lại')
      }
    }
  }

  const retry = () => {
    setLoadError('')
    setAttempt((n) => n + 1)
  }

  if (loadError) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p role="alert" className="text-red-600">{loadError}</p>
        <button type="button" onClick={retry} className="mt-4 rounded border border-slate-300 px-4 py-2">Thử lại</button>
      </main>
    )
  }
  if (!categories) return <main className="mx-auto max-w-xl p-8"><p>Đang tải...</p></main>
  if (categories.length === 0) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p role="alert">
          Cần tạo ít nhất một thể loại trước khi thêm sách. <Link to="/categories" className="text-blue-700 underline">Đến trang Thể loại</Link>
        </p>
      </main>
    )
  }

  const a11y = (name) => fieldProps(errors, name)

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Thêm sách mới</h1>
      {created && (
        <p role="status" className="mb-4 rounded bg-green-50 p-3 text-green-800">
          Thêm sách thành công: {created.title}
        </p>
      )}
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field id="title" label="Tên sách" error={errors.title?.message}>
          <input
            {...a11y('title')}
            className={inputClass}
            {...register('title', {
              validate: required('Tên sách không được để trống'),
              maxLength: { value: 100, message: 'Tên sách tối đa 100 ký tự' },
            })}
          />
        </Field>
        <Field id="author" label="Tác giả" error={errors.author?.message}>
          <input
            {...a11y('author')}
            className={inputClass}
            {...register('author', {
              validate: required('Tác giả không được để trống'),
              maxLength: { value: 100, message: 'Tác giả tối đa 100 ký tự' },
            })}
          />
        </Field>
        <Field id="publishYear" label="Năm xuất bản" error={errors.publishYear?.message}>
          <input
            type="number"
            {...a11y('publishYear')}
            className={inputClass}
            {...register('publishYear', {
              validate: (v) => {
                if (String(v).trim() === '') return 'Năm xuất bản không được để trống'
                const n = Number(v)
                return (Number.isInteger(n) && n >= 1900 && n <= currentYear) || YEAR_MESSAGE
              },
            })}
          />
        </Field>
        <Field id="isbn" label="ISBN (nếu có)" error={errors.isbn?.message}>
          <input
            {...a11y('isbn')}
            className={inputClass}
            {...register('isbn', {
              validate: (v) => v.trim() === '' || isValidIsbn(v) || 'ISBN không hợp lệ (ISBN-10 hoặc ISBN-13)',
            })}
          />
        </Field>
        <Field id="categoryId" label="Thể loại" error={errors.categoryId?.message}>
          <select
            {...a11y('categoryId')}
            className={inputClass}
            {...register('categoryId', { validate: required('Vui lòng chọn thể loại') })}
          >
            <option value="">-- Chọn thể loại --</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field id="description" label="Mô tả" error={errors.description?.message}>
          <textarea
            rows={3}
            {...a11y('description')}
            className={inputClass}
            {...register('description', {
              validate: required('Mô tả không được để trống'),
              maxLength: { value: 255, message: 'Mô tả tối đa 255 ký tự' },
            })}
          />
        </Field>
        <Field id="quantity" label="Số lượng bản sách" error={errors.quantity?.message}>
          <input
            type="number"
            {...a11y('quantity')}
            className={inputClass}
            {...register('quantity', {
              validate: (v) => {
                if (String(v).trim() === '') return 'Số lượng không được để trống'
                const n = Number(v)
                if (!Number.isInteger(n)) return 'Số lượng phải là số nguyên'
                if (n < 1) return 'Số lượng phải lớn hơn 0'
                return n <= MAX_QUANTITY || `Số lượng tối đa ${MAX_QUANTITY}`
              },
            })}
          />
        </Field>
        {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
        <button type="submit" disabled={isSubmitting} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          Thêm sách
        </button>
      </form>
    </main>
  )
}
