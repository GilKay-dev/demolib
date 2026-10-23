import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { api } from '../lib/api'

// 2.3.1: nút "Mượn sách" kèm lý do nếu chưa đủ điều kiện; modal chọn thời hạn (1-30 ngày, mặc định 14)
export default function BorrowPanel({ bookId }) {
  const [eligibility, setEligibility] = useState(null)
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState('')
  const [serverError, setServerError] = useState('')
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { days: 14 } })

  useEffect(() => {
    let ignore = false
    api
      .get('/borrows/eligibility', { params: { bookId } })
      .then(({ data }) => !ignore && setEligibility(data))
      .catch(() => !ignore && setEligibility({ eligible: true })) // server vẫn kiểm tra lại khi gửi
    return () => {
      ignore = true
    }
  }, [bookId])

  const close = () => {
    setOpen(false)
    setServerError('')
    reset({ days: 14 })
  }

  const onSubmit = async ({ days }) => {
    setServerError('')
    try {
      const { data } = await api.post('/borrows', { bookId, days: Number(days) })
      setDone(data.message)
      setEligibility({ eligible: false, message: 'Bạn đã mượn hoặc đang chờ duyệt sách này' })
      setOpen(false)
    } catch (err) {
      setServerError(err.response?.data?.errors?.days ?? err.response?.data?.message ?? 'Không thể gửi yêu cầu, vui lòng thử lại')
    }
  }

  // Hiện nút ngay (mờ) trong lúc chờ server kiểm tra điều kiện, tránh nút xuất hiện trễ
  return (
    <div className="mb-6">
      {done && <p role="status" className="mb-2 text-green-700">{done}</p>}
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!eligibility?.eligible}
        className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50"
      >
        Mượn sách
      </button>
      {eligibility && !eligibility.eligible && !done && (
        <p className="mt-2 text-slate-700">
          {eligibility.message}
          {eligibility.link && (
            <>
              {' '}
              <Link to={eligibility.link} className="text-blue-700 underline">Xem khoản phạt</Link>
            </>
          )}
        </p>
      )}

      {open && (
        <form
          role="dialog"
          aria-label="Chọn thời hạn mượn"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
          className="mt-3 rounded border border-slate-300 p-3"
        >
          <label htmlFor="days" className="block text-slate-700">Thời hạn mượn (ngày)</label>
          <input
            id="days"
            type="number"
            className="mt-1 w-32 rounded border border-slate-300 px-2 py-1"
            {...register('days', {
              required: 'Thời hạn từ 1 đến 30 ngày',
              validate: (v) => (Number.isInteger(Number(v)) && v >= 1 && v <= 30) || 'Thời hạn từ 1 đến 30 ngày',
            })}
          />
          {errors.days && <p role="alert" className="text-red-600">{errors.days.message}</p>}
          {serverError && <p role="alert" className="text-red-600">{serverError}</p>}
          <div className="mt-3 flex gap-3">
            <button type="submit" disabled={isSubmitting} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50">
              Gửi yêu cầu
            </button>
            <button type="button" onClick={close} disabled={isSubmitting} className="rounded border border-slate-300 px-4 py-2">
              Hủy
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
