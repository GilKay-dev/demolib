import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router'
import { Field } from '../components/Field'
import { api } from '../lib/api'
import { fieldProps, inputClass } from '../lib/form'
import { isValidIsbn } from '../lib/isbn'

const FIELDS = ['title', 'author', 'publishYear', 'isbn', 'categoryId', 'description', 'quantity']
const MAX_QUANTITY = 100000

// Tính tại lúc validate (không cố định lúc tải module), giống server
const currentYear = () => new Date().getFullYear()

const required = (message) => (v) => String(v).trim() !== '' || message

// Giống server: cắt khoảng trắng rồi mới kiểm tra rỗng / độ dài
const text = (emptyMessage, max, tooLongMessage) => ({
  validate: (v) => {
    const t = v.trim()
    if (t === '') return emptyMessage
    return t.length <= max || tooLongMessage
  },
})

export default function BookEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let ignore = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadError('')
    setNotFound(false)
    setData(null)
    Promise.all([api.get(`/books/${id}`), api.get('/categories')])
      .then(([book, categories]) => !ignore && setData({ book: book.data, categories: categories.data }))
      .catch((err) => {
        if (ignore) return
        if (err.response?.status === 404) setNotFound(true)
        else setLoadError('Không thể tải thông tin sách, vui lòng thử lại')
      })
    return () => {
      ignore = true
    }
  }, [id, attempt])

  if (notFound) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p role="alert" className="text-red-600">Không tìm thấy sách</p>
        <p className="mt-4"><Link to="/books" className="text-blue-700 underline">← Danh sách sách</Link></p>
      </main>
    )
  }
  if (loadError) {
    return (
      <main className="mx-auto max-w-xl p-8">
        <p role="alert" className="text-red-600">{loadError}</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-4 rounded border border-slate-300 px-4 py-2">Thử lại</button>
      </main>
    )
  }
  if (!data) return <main className="mx-auto max-w-xl p-8"><p>Đang tải...</p></main>

  return <EditForm book={data.book} categories={data.categories} onSaved={() => navigate(`/books/${id}`)} />
}

function EditForm({ book, categories, onSaved }) {
  const [formError, setFormError] = useState('')
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      title: book.title,
      author: book.author,
      publishYear: String(book.publishYear),
      isbn: book.isbn ?? '',
      categoryId: String(book.category.id),
      description: book.description,
      // Tổng số bản = đang có + đang mượn
      quantity: String(book.availableQuantity + book.borrowedQuantity),
    },
  })

  const onSubmit = async (values) => {
    setFormError('')
    try {
      await api.put(`/books/${book.id}`, values)
      onSaved()
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
        setFormError(data?.message ?? 'Không thể cập nhật sách, vui lòng thử lại')
      }
    }
  }

  const a11y = (name) => fieldProps(errors, name)

  return (
    <main className="mx-auto max-w-xl p-8">
      <p className="mb-4"><Link to={`/books/${book.id}`} className="text-blue-700 underline">← Chi tiết sách</Link></p>
      <h1 className="mb-6 text-2xl font-bold text-slate-900">Sửa sách</h1>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <Field id="title" label="Tên sách" error={errors.title?.message}>
          <input
            {...a11y('title')}
            className={inputClass}
            {...register('title', text('Tên sách không được để trống', 100, 'Tên sách tối đa 100 ký tự'))}
          />
        </Field>
        <Field id="author" label="Tác giả" error={errors.author?.message}>
          <input
            {...a11y('author')}
            className={inputClass}
            {...register('author', text('Tác giả không được để trống', 100, 'Tác giả tối đa 100 ký tự'))}
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
                const year = currentYear()
                const n = Number(v)
                return (Number.isInteger(n) && n >= 1900 && n <= year) || `Năm xuất bản phải từ 1900 đến ${year}`
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
            {...register('description', text('Mô tả không được để trống', 255, 'Mô tả tối đa 255 ký tự'))}
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
                if (n < book.borrowedQuantity) return `Số lượng không được nhỏ hơn số sách đang mượn (${book.borrowedQuantity})`
                return n <= MAX_QUANTITY || `Số lượng tối đa ${MAX_QUANTITY}`
              },
            })}
          />
        </Field>
        {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
        <button type="submit" disabled={isSubmitting} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50">
          Lưu thay đổi
        </button>
      </form>
    </main>
  )
}
