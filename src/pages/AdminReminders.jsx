// ==============================
// FILE: src/pages/AdminReminders.jsx
// ==============================
import React, { useEffect, useMemo, useState } from 'react'
import supabase from '../supabaseClient'

// If you have a central auth/user hook, you can replace with that
import InitAuthAudit from '../auth/initAuthAudit.jsx'

// Simple utilities
const toISODate = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
const startOfWeek = (date) => {
  const d = new Date(date)
  const day = d.getDay() // 0 Sun ... 6 Sat
  const diff = (day === 0 ? -6 : 1) - day // Monday as start
  d.setDate(d.getDate() + diff)
  d.setHours(0,0,0,0)
  return d
}
const endOfWeek = (date) => {
  const s = startOfWeek(date)
  const e = new Date(s)
  e.setDate(e.getDate() + 7)
  e.setMilliseconds(-1)
  return e
}
const fmtDateTimeUK = (iso) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(iso))

const defaultTemplate = `Hi {{first_name}}, just a friendly reminder of your appointment on {{date}} at {{time}}. See you soon!`

const channels = ['email','sms','whatsapp']

export default function AdminReminders() {
  const [from, setFrom] = useState(() => startOfWeek(new Date()))
  const [to, setTo] = useState(() => endOfWeek(new Date()))
  const [channel, setChannel] = useState('email')
  const [template, setTemplate] = useState(defaultTemplate)
  const [loading, setLoading] = useState(false)
  const [bookings, setBookings] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [sentResult, setSentResult] = useState(null)

  // Replace with your real admin/role check if available
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      // Example: check a user_metadata role, or query a profile table
      if (user?.user_metadata?.role === 'admin') setIsAdmin(true)
    })()
  }, [])

  const fetchBookings = async () => {
    setError('')
    setLoading(true)
    try {
      // \!\! IMPORTANT: Adjust table and column names to match your schema
      // Assumed tables:
      // bookings(id, start_time, end_time, client_id, note)
      // clients(id, first_name, last_name, email, phone, whatsapp_opt_in)
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          start_time,
          end_time,
          note,
          clients:client_id(id, first_name, last_name, email, phone, whatsapp_opt_in)
        `)
        .gte('start_time', from.toISOString())
        .lte('start_time', to.toISOString())
        .order('start_time', { ascending: true })

      if (error) throw error

      const rows = (data || []).map((b) => ({
        id: b.id,
        start_time: b.start_time,
        end_time: b.end_time,
        note: b.note,
        client: {
          id: b.clients?.id,
          first_name: b.clients?.first_name || '',
          last_name: b.clients?.last_name || '',
          email: b.clients?.email || '',
          phone: b.clients?.phone || '',
          whatsapp_opt_in: !!b.clients?.whatsapp_opt_in,
        }
      }))
      setBookings(rows)
      setSelectedIds(new Set(rows.map(r => r.id))) // preselect all
    } catch (e) {
      console.error(e)
      setError(e.message || 'Failed to load bookings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBookings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return bookings
    return bookings.filter((b) => {
      const name = `${b.client.first_name} ${b.client.last_name}`.toLowerCase()
      return name.includes(q) || b.client.email.toLowerCase().includes(q) || (b.client.phone || '').toLowerCase().includes(q)
    })
  }, [bookings, search])

  const toggleAll = (checked) => {
    if (checked) setSelectedIds(new Set(filtered.map(b => b.id)))
    else setSelectedIds(new Set())
  }

  const onSend = async () => {
    setError('')
    setLoading(true)
    setSentResult(null)
    try {
      const selected = bookings.filter(b => selectedIds.has(b.id))
      if (!selected.length) throw new Error('No bookings selected')

      const resp = await fetch('/.netlify/functions/sendBulkReminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          template,
          timezone: 'Europe/London',
          bookings: selected.map(b => ({
            booking_id: b.id,
            start_time: b.start_time,
            end_time: b.end_time,
            client: b.client,
          }))
        })
      })

      if (!resp.ok) {
        const t = await resp.text()
        throw new Error(t || 'Failed to send reminders')
      }
      const json = await resp.json()
      setSentResult(json)
    } catch (e) {
      console.error(e)
      setError(e.message || 'Failed to send reminders')
    } finally {
      setLoading(false)
    }
  }

  const replaceTokens = (tpl, b) => {
    const date = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'Europe/London' }).format(new Date(b.start_time))
    const time = new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Europe/London' }).format(new Date(b.start_time))
    return tpl
      .replaceAll('{{first_name}}', b.client.first_name || '')
      .replaceAll('{{last_name}}', b.client.last_name || '')
      .replaceAll('{{date}}', date)
      .replaceAll('{{time}}', time)
  }

  if (!isAdmin) {
    return (
      <div className="p-6">
        <InitAuthAudit />
        <h1 className="text-2xl font-semibold">Reminders</h1>
        <p className="mt-2 text-red-600">You must be an admin to access this page.</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Send Appointment Reminders</h1>

      <section className="grid gap-3 md:grid-cols-4">
        <div className="col-span-2 flex items-center gap-2">
          <label className="text-sm w-20">From</label>
          <input type="date" className="border rounded p-2 w-full" value={from.toISOString().slice(0,10)} onChange={(e)=>{
            const d = new Date(e.target.value)
            d.setHours(0,0,0,0)
            setFrom(d)
          }} />
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <label className="text-sm w-20">To</label>
          <input type="date" className="border rounded p-2 w-full" value={to.toISOString().slice(0,10)} onChange={(e)=>{
            const d = new Date(e.target.value)
            d.setHours(23,59,59,999)
            setTo(d)
          }} />
        </div>
        <div className="col-span-4 flex flex-wrap gap-2">
          <button className="border rounded px-3 py-2" onClick={()=>{ setFrom(startOfWeek(new Date())); setTo(endOfWeek(new Date())); }}>This week</button>
          <button className="border rounded px-3 py-2" onClick={()=>{ const d=new Date(); d.setDate(d.getDate()+7); setFrom(startOfWeek(d)); setTo(endOfWeek(d)); }}>Next week</button>
          <button className="border rounded px-3 py-2" onClick={()=>{ const d=new Date(); setFrom(new Date(d.getFullYear(), d.getMonth(), 1)); setTo(new Date(d.getFullYear(), d.getMonth()+1, 0, 23,59,59,999)); }}>This month</button>
          <button className="border rounded px-3 py-2" onClick={fetchBookings} disabled={loading}>{loading? 'Loading...' : 'Refresh'}</button>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-4 items-start">
        <div className="col-span-4 md:col-span-1">
          <label className="block text-sm mb-1">Channel</label>
          <select className="border rounded p-2 w-full" value={channel} onChange={(e)=>setChannel(e.target.value)}>
            {channels.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
          </select>
        </div>
        <div className="col-span-4 md:col-span-3">
          <label className="block text-sm mb-1">Message template</label>
          <textarea className="border rounded p-3 w-full min-h-[120px]" value={template} onChange={(e)=>setTemplate(e.target.value)} />
          <p className="text-xs text-gray-500 mt-1">Use tokens: {'{{first_name}}'}, {'{{last_name}}'}, {'{{date}}'}, {'{{time}}'}</p>
        </div>
      </section>

      <section className="flex items-center gap-2">
        <input className="border rounded p-2" placeholder="Search name, email, phone" value={search} onChange={(e)=>setSearch(e.target.value)} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={filtered.length && selectedIds.size === filtered.length} onChange={(e)=>toggleAll(e.target.checked)} />
          <span>Select all ({filtered.length})</span>
        </label>
        <button className="ml-auto bg-black text-white rounded px-4 py-2" onClick={onSend} disabled={loading}>{loading ? 'Sending…' : 'Send reminders'}</button>
      </section>

      {error && <div className="p-3 bg-red-50 text-red-700 rounded">{error}</div>}
      {sentResult && (
        <div className="p-3 bg-green-50 text-green-700 rounded">
          <div className="font-semibold">Sent</div>
          <div>Total: {sentResult.total} | Success: {sentResult.success} | Failed: {sentResult.failed}</div>
        </div>
      )}

      <section className="overflow-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">Sel</th>
              <th className="p-2 text-left">Client</th>
              <th className="p-2 text-left">Contact</th>
              <th className="p-2 text-left">Appointment</th>
              <th className="p-2 text-left">Preview</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((b) => {
              const checked = selectedIds.has(b.id)
              const preview = replaceTokens(template, b)
              return (
                <tr key={b.id} className="border-t align-top">
                  <td className="p-2"><input type="checkbox" checked={checked} onChange={(e)=>{
                    const next = new Set(selectedIds)
                    if (e.target.checked) next.add(b.id); else next.delete(b.id)
                    setSelectedIds(next)
                  }} /></td>
                  <td className="p-2">{b.client.first_name} {b.client.last_name}</td>
                  <td className="p-2">
                    <div>{b.client.email || '—'}</div>
                    <div className="text-gray-500">{b.client.phone || '—'}</div>
                  </td>
                  <td className="p-2">
                    <div>{fmtDateTimeUK(b.start_time)}</div>
                    {b.end_time && <div className="text-gray-500">Ends {fmtDateTimeUK(b.end_time)}</div>}
                  </td>
                  <td className="p-2 text-gray-700 whitespace-pre-wrap">{preview}</td>
                </tr>
              )
            })}
            {!filtered.length && (
              <tr><td colSpan={5} className="p-6 text-center text-gray-500">No bookings in range.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="text-xs text-gray-500">
        <p>Note: Update table/column names in the Supabase query if your schema differs. This page expects a <code>bookings</code> table with a FK <code>client_id</code> to a <code>clients</code> table.</p>
      </section>
    </div>
  )
}