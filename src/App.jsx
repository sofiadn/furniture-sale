import { useState, useEffect, useRef } from 'react'
import bakedItems from './items.json'
import { supabase } from './supabase'
import './App.css'

const STORAGE_KEY = 'furniture-sale-items-v4'
const ADMIN_KEY = 'furniture-sale-admin'
const SELLER_EMAIL = 'sofianaydenovad@gmail.com'

function resolveAdmin() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('admin') === '1') {
    localStorage.setItem(ADMIN_KEY, '1')
    return true
  }
  if (params.get('admin') === '0') {
    localStorage.removeItem(ADMIN_KEY)
    return false
  }
  return localStorage.getItem(ADMIN_KEY) === '1'
}

const STARTER_ITEMS = bakedItems

function loadItems() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return STARTER_ITEMS
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length ? parsed : STARTER_ITEMS
  } catch {
    return STARTER_ITEMS
  }
}

function saveItems(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    return true
  } catch {
    alert('Storage is full — uploaded photos take the most space. Delete a photo or an item to make room.')
    return false
  }
}

function formatPrice(p) {
  if (p === '' || p == null || isNaN(Number(p))) return ''
  return `$${Number(p).toLocaleString()}`
}

const CATEGORY_ORDER = ['Furniture', 'Appliances', 'Bedding', 'Home', 'Tech', 'Misc']

function amazonAsinImage(url) {
  const m = url.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)
  if (!m) return null
  return `https://images-na.ssl-images-amazon.com/images/P/${m[1]}.01._SCRMZZZZZZ_.jpg`
}

async function compressImage(file, maxDim = 800, quality = 0.8) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

async function fetchPreview(url) {
  if (!url) return null
  const amz = amazonAsinImage(url)
  if (amz) return amz
  try {
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`)
    if (!res.ok) return null
    const json = await res.json()
    if (json.status !== 'success') return null
    const img = json.data?.image?.url || json.data?.logo?.url || ''
    if (!img) return null
    if (/amazon|prime/i.test(img) && !/\/images\/I\//i.test(img)) return null
    if (/logo|favicon|static\.ingka|\.svg($|\?)/i.test(img)) return null
    return img
  } catch {
    return null
  }
}

function ItemForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [price, setPrice] = useState(initial?.price ?? '')
  const [link, setLink] = useState(initial?.link ?? '')
  const [image, setImage] = useState(initial?.image ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [category, setCategory] = useState(initial?.category ?? 'Misc')
  const [uploadError, setUploadError] = useState('')
  const [uploading, setUploading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploadError('')
    setUploading(true)
    try {
      const dataUrl = await compressImage(file)
      setImage(dataUrl)
    } catch {
      setUploadError('Could not read that image — try a different file.')
    } finally {
      setUploading(false)
    }
  }

  function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    const linkChanged = (initial?.link ?? '') !== link.trim()
    const imageChanged = (initial?.image ?? '') !== image.trim()
    onSave({
      id: initial?.id ?? Date.now(),
      name: name.trim(),
      price: price === '' ? '' : Number(price),
      link: link.trim(),
      image: imageChanged ? image.trim() : linkChanged ? '' : (initial?.image ?? ''),
      note: note.trim(),
      category,
    })
  }

  return (
    <div className="modal-ov" onClick={onCancel}>
      <form className="form-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="form-title">{initial ? 'Edit item' : 'Add item'}</div>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Oak dining table" autoFocus />
        </label>
        <label className="field">
          <span>Price ($) — leave blank to hide</span>
          <input type="number" min="0" step="1" value={price} onChange={e => setPrice(e.target.value)} placeholder="150" />
        </label>
        <label className="field">
          <span>Category</span>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            {CATEGORY_ORDER.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Link (image is auto-pulled for Amazon /dp links)</span>
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://amazon.com/dp/..." />
        </label>
        <label className="field">
          <span>Photo</span>
          {image && (
            <div className="form-preview-wrap">
              <img src={image} alt="preview" className="form-preview" />
              <button type="button" className="linklike danger" onClick={() => setImage('')}>Remove photo</button>
            </div>
          )}
          <input type="file" accept="image/*" onChange={handleFile} className="file-input" />
          {uploading && <span className="field-hint">Compressing…</span>}
          {uploadError && <span className="field-hint error">{uploadError}</span>}
          <span className="field-hint">Or paste an image URL:</span>
          <input value={image.startsWith('data:') ? '' : image} onChange={e => setImage(e.target.value)} placeholder="https://..." />
        </label>
        <label className="field">
          <span>Note (optional)</span>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Dimensions, condition, pickup location..." />
        </label>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary">{initial ? 'Save' : 'Add item'}</button>
        </div>
      </form>
    </div>
  )
}

function InterestedModal({ item, onClose, onSubmitted }) {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [offer, setOffer] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!name.trim() || !contact.trim()) return
    setSubmitting(true)
    setError('')
    if (!supabase) {
      setError('Storage not configured. Contact the seller directly.')
      setSubmitting(false)
      return
    }
    const { error: insertError } = await supabase.from('offers').insert({
      item_name: item.name,
      friend_name: name.trim(),
      friend_contact: contact.trim(),
      offer_price: offer === '' ? null : Number(offer),
      message: message.trim() || null,
    })
    setSubmitting(false)
    if (insertError) {
      setError(insertError.message || 'Could not send — try again.')
      return
    }
    onSubmitted()
  }

  return (
    <div className="modal-ov" onClick={onClose}>
      <form className="form-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="form-title">Interested in "{item.name}"</div>
        <div className="field-hint">Fill this out and Sofia will get back to you.</div>
        <label className="field">
          <span>Your name</span>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus required />
        </label>
        <label className="field">
          <span>Email or phone</span>
          <input value={contact} onChange={e => setContact(e.target.value)} placeholder="you@example.com" required />
        </label>
        <label className="field">
          <span>Your offer ($) — optional</span>
          <input type="number" min="0" step="1" value={offer} onChange={e => setOffer(e.target.value)} placeholder={formatPrice(item.price)} />
        </label>
        <label className="field">
          <span>Message (optional)</span>
          <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="When can you pick it up? Any questions?" />
        </label>
        {error && <span className="field-hint error">{error}</span>}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'Sending…' : 'Send'}</button>
        </div>
      </form>
    </div>
  )
}

function ItemCard({ item, loading, admin, onEdit, onDelete, onInterested }) {
  const [imgFailed, setImgFailed] = useState(false)
  useEffect(() => { setImgFailed(false) }, [item.image])

  return (
    <div className="card">
      <div className="card-img-wrap">
        {item.image && !imgFailed ? (
          <img src={item.image} alt={item.name} className="card-img" onError={() => setImgFailed(true)} />
        ) : loading ? (
          <div className="card-img-placeholder">Loading preview…</div>
        ) : (
          <div className="card-img-placeholder">{admin ? 'No photo yet — edit to add one' : 'No photo'}</div>
        )}
      </div>
      <div className="card-body">
        <div className="card-name">{item.name}</div>
        {formatPrice(item.price) && <div className="card-price">{formatPrice(item.price)}</div>}
        {item.note && <div className="card-note">{item.note}</div>}
        <div className="card-actions">
          <button className="btn btn-primary" onClick={() => onInterested(item)}>Interested</button>
          {item.link ? (
            <a className="btn btn-ghost" href={item.link} target="_blank" rel="noreferrer">View original</a>
          ) : (
            <span className="btn btn-ghost disabled">No link</span>
          )}
        </div>
        {admin && (
          <div className="card-manage">
            <button className="linklike" onClick={() => onEdit(item)}>Edit</button>
            <span className="dot">·</span>
            <button className="linklike danger" onClick={() => onDelete(item)}>Delete</button>
          </div>
        )}
      </div>
    </div>
  )
}

function OffersView({ onBack }) {
  const [offers, setOffers] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) {
      setError('Supabase is not configured.')
      setOffers([])
      return
    }
    supabase.from('offers').select('*').order('created_at', { ascending: false }).then(({ data, error }) => {
      if (error) setError(error.message)
      setOffers(data || [])
    })
  }, [])

  async function remove(id) {
    if (!confirm('Delete this offer?')) return
    await supabase.from('offers').delete().eq('id', id)
    setOffers(prev => prev.filter(o => o.id !== id))
  }

  return (
    <div>
      <header className="topbar">
        <div>
          <h1 className="title">Offers</h1>
          <div className="subtitle">
            {offers == null ? 'Loading…' : `${offers.length} ${offers.length === 1 ? 'offer' : 'offers'}`}
            <span className="admin-pill">admin</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="btn btn-ghost" onClick={onBack}>← Back to list</button>
        </div>
      </header>
      {error && <div className="empty"><div className="empty-title">Couldn't load offers</div><div className="empty-sub">{error}</div></div>}
      {offers && offers.length === 0 && !error && (
        <div className="empty">
          <div className="empty-title">No offers yet</div>
          <div className="empty-sub">When friends hit "Interested" you'll see their submissions here.</div>
        </div>
      )}
      {offers && offers.length > 0 && (
        <ul className="offers">
          {offers.map(o => (
            <li key={o.id} className="offer">
              <div className="offer-head">
                <div>
                  <div className="offer-item">{o.item_name}</div>
                  <div className="offer-sub">
                    {new Date(o.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
                {o.offer_price != null && <div className="offer-price">${Number(o.offer_price).toLocaleString()}</div>}
              </div>
              <div className="offer-body">
                <div className="offer-row"><span className="offer-label">From</span> <span>{o.friend_name}</span></div>
                <div className="offer-row"><span className="offer-label">Contact</span> <a href={o.friend_contact.includes('@') ? `mailto:${o.friend_contact}` : `tel:${o.friend_contact}`}>{o.friend_contact}</a></div>
                {o.message && <div className="offer-row"><span className="offer-label">Message</span> <span>{o.message}</span></div>}
              </div>
              <button className="linklike danger" onClick={() => remove(o.id)}>Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function App() {
  const [items, setItems] = useState(loadItems)
  const [editing, setEditing] = useState(null)
  const [loadingIds, setLoadingIds] = useState(() => new Set())
  const [admin] = useState(resolveAdmin)
  const [interested, setInterested] = useState(null)
  const [thanks, setThanks] = useState(false)
  const [view, setView] = useState('items')
  const fetchingRef = useRef(new Set())

  useEffect(() => {
    saveItems(items)
  }, [items])

  useEffect(() => {
    items.forEach(item => {
      if (item.link && !item.image && !fetchingRef.current.has(item.id)) {
        fetchingRef.current.add(item.id)
        setLoadingIds(prev => {
          const next = new Set(prev)
          next.add(item.id)
          return next
        })
        fetchPreview(item.link).then(image => {
          setItems(prev => prev.map(p => (p.id === item.id ? { ...p, image: image || p.image } : p)))
          setLoadingIds(prev => {
            const next = new Set(prev)
            next.delete(item.id)
            return next
          })
        })
      }
    })
  }, [items])

  function handleSave(item) {
    setItems(prev => {
      const idx = prev.findIndex(p => p.id === item.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = item
        return next
      }
      return [item, ...prev]
    })
    fetchingRef.current.delete(item.id)
    setEditing(null)
  }

  function handleDelete(item) {
    if (!confirm(`Delete "${item.name}"?`)) return
    setItems(prev => prev.filter(p => p.id !== item.id))
  }

  function handleReset() {
    if (!confirm('Reset to the full starter list? This will replace your current items.')) return
    localStorage.removeItem(STORAGE_KEY)
    fetchingRef.current = new Set()
    setItems(STARTER_ITEMS)
  }

  function handleExport() {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'items.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (admin && view === 'offers') {
    return (
      <div className="page">
        <OffersView onBack={() => setView('items')} />
      </div>
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1 className="title">Sofia's Moving Sale</h1>
          <div className="subtitle">
            {items.length} {items.length === 1 ? 'item' : 'items'} available · pickup in person
            {admin && <span className="admin-pill">admin</span>}
          </div>
        </div>
        {admin && (
          <div className="topbar-actions">
            <button className="btn btn-ghost" onClick={() => setView('offers')}>View offers</button>
            <button className="btn btn-ghost" onClick={handleExport}>Export</button>
            <button className="btn btn-ghost" onClick={handleReset}>Reset list</button>
            <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add item</button>
          </div>
        )}
      </header>

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No items available right now</div>
          <div className="empty-sub">{admin ? 'Click "Add item" to list your first piece of furniture.' : 'Check back soon!'}</div>
        </div>
      ) : (
        (() => {
          const byCat = {}
          items.forEach(i => {
            const c = i.category || 'Misc'
            if (!byCat[c]) byCat[c] = []
            byCat[c].push(i)
          })
          const ordered = [
            ...CATEGORY_ORDER.filter(c => byCat[c]),
            ...Object.keys(byCat).filter(c => !CATEGORY_ORDER.includes(c)),
          ]
          return ordered.map(cat => (
            <section key={cat} className="category">
              <h2 className="category-title">{cat} <span className="category-count">{byCat[cat].length}</span></h2>
              <div className="grid">
                {byCat[cat].map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    loading={loadingIds.has(item.id)}
                    admin={admin}
                    onEdit={setEditing}
                    onDelete={handleDelete}
                    onInterested={setInterested}
                  />
                ))}
              </div>
            </section>
          ))
        })()
      )}

      {editing && (
        <ItemForm
          initial={editing === 'new' ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}

      {interested && (
        <InterestedModal
          item={interested}
          onClose={() => setInterested(null)}
          onSubmitted={() => { setInterested(null); setThanks(true); setTimeout(() => setThanks(false), 4000) }}
        />
      )}

      {thanks && (
        <div className="thanks-toast">Thanks — Sofia will be in touch.</div>
      )}
    </div>
  )
}
