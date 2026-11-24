import { useState, useEffect, type FormEvent } from 'react'
import { Lock, Unlock, AlertCircle, Laptop, CheckCircle, XCircle, Trash2, ShieldCheck, RefreshCw, Database, Store, ShieldAlert, LogOut, KeyRound } from 'lucide-react'

interface Device {
  id: string
  hostname?: string
  osInfo?: string
  isApproved?: boolean
  lastSeen?: string
  updatedAt?: string
  customerId?: string
  customerName?: string
}

interface CustomerInfo {
  id: string
  customerId: string
  customerName: string
  lastActive?: string
  hostname?: string
}

function App() {
  const [adminPassword, setAdminPassword] = useState<string>(() => sessionStorage.getItem('vendor_admin_pwd') || '')
  const [passwordInput, setPasswordInput] = useState('')
  const [authenticated, setAuthenticated] = useState<boolean>(false)
  const [isLocked, setIsLocked] = useState<boolean | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [customers, setCustomers] = useState<CustomerInfo[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('all')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  const apiFetch = async (endpoint: string, options: any = {}, pwdOverride?: string) => {
    const pwd = pwdOverride ?? adminPassword
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': pwd,
        ...(options.headers || {}),
      },
    })
    const data = await res.json()
    return { ok: res.ok, status: res.status, data }
  }

  const showNotice = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 4000)
  }

  const checkStatus = async (pwdOverride?: string) => {
    setError('')
    setLoading(true)
    try {
      const { ok, status, data } = await apiFetch('/api/vendor/status', { method: 'POST' }, pwdOverride)
      if (status === 401) {
        setAuthenticated(false)
        sessionStorage.removeItem('vendor_admin_pwd')
        setError(data.error || 'كلمة المرور غير صحيحة')
        return
      }
      if (ok && data.success) {
        setAuthenticated(true)
        if (pwdOverride) {
          setAdminPassword(pwdOverride)
          sessionStorage.setItem('vendor_admin_pwd', pwdOverride)
        }
        setIsLocked(data.isLocked)
        setDevices(data.devices || [])
      } else {
        setError(data.error || 'فشل في التحقق')
        return
      }

      const custRes = await apiFetch('/api/vendor/customers', { method: 'GET' }, pwdOverride)
      if (custRes.ok && custRes.data.success) {
        setCustomers(custRes.data.customers || [])
      }
    } catch {
      setError('تعذر الاتصال بالخادم السحابي')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (adminPassword) {
      checkStatus(adminPassword)
    }
  }, [])

  const handleLogin = (e: FormEvent) => {
    e.preventDefault()
    if (!passwordInput.trim()) return
    checkStatus(passwordInput.trim())
  }

  const handleLogout = () => {
    sessionStorage.removeItem('vendor_admin_pwd')
    setAdminPassword('')
    setPasswordInput('')
    setAuthenticated(false)
    setDevices([])
    setCustomers([])
    setIsLocked(null)
  }

  const toggleLock = async () => {
    if (isLocked === null) return
    setLoading(true)
    setError('')
    try {
      const { ok, data } = await apiFetch('/api/vendor/toggle-lock', {
        method: 'POST',
        body: JSON.stringify({ isLocked: !isLocked })
      })
      if (ok && data.success) {
        setIsLocked(data.isLocked)
        showNotice(data.isLocked ? 'تم قفل النظام بالكامل عن جميع الأجهزة فوراً' : 'تم فتح القفل العام للنظام')
      } else {
        setError(data.error || 'فشل في تغيير الحالة')
      }
    } catch {
      setError('لا يمكن الاتصال بالخادم')
    } finally {
      setLoading(false)
    }
  }

  const lockAllDevices = async () => {
    if (!confirm('هل أنت متأكد من قفل وإلغاء ترخيص جميع الأجهزة المسجلة دفعة واحدة؟')) return
    setError('')
    try {
      const { ok, data } = await apiFetch('/api/vendor/lock-all-devices', { method: 'POST' })
      if (ok && data.success) {
        setDevices(prev => prev.map(d => ({ ...d, isApproved: false })))
        showNotice(`تم قفل جميع الأجهزة (${data.lockedCount}) بنجاح`)
      } else {
        setError(data.error || 'فشل في قفل الأجهزة')
      }
    } catch {
      setError('تعذر قفل الأجهزة')
    }
  }

  const toggleDevice = async (machineId: string, currentApproval: boolean) => {
    setError('')
    try {
      const { ok, data } = await apiFetch('/api/vendor/toggle-device', {
        method: 'POST',
        body: JSON.stringify({ machineId, isApproved: !currentApproval })
      })
      if (ok && data.success) {
        setDevices(prev => prev.map(d => d.id === machineId ? { ...d, isApproved: !currentApproval } : d))
        showNotice(!currentApproval ? 'تم تفعيل وترخيص الجهاز بنجاح' : 'تم قفل الجهاز وإيقافه فوراً')
      } else {
        setError(data.error || 'فشل في تحديث حالة الجهاز')
      }
    } catch {
      setError('تعذر تحديث حالة الجهاز')
    }
  }

  const deleteDevice = async (machineId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الجهاز؟ سيتم قفله فوراً إذا كان يعمل.')) return
    setError('')
    try {
      const { ok, data } = await apiFetch('/api/vendor/delete-device', {
        method: 'POST',
        body: JSON.stringify({ machineId })
      })
      if (ok && data.success) {
        setDevices(prev => prev.filter(d => d.id !== machineId))
        showNotice('تم حذف الجهاز وقفله بنجاح')
      } else {
        setError(data.error || 'فشل في حذف الجهاز')
      }
    } catch {
      setError('تعذر حذف الجهاز')
    }
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4" dir="rtl">
        <form onSubmit={handleLogin} className="bg-slate-900 border border-slate-800 rounded-2xl p-8 w-full max-w-md shadow-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto">
              <KeyRound size={32} />
            </div>
            <h1 className="text-2xl font-bold text-white">لوحة تحكم المزود السحابية</h1>
            <p className="text-sm text-slate-400">أدخل كلمة مرور الإدارة (ADMIN_PASSWORD) للتحكم في الأجهزة والتراخيص</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-300 bg-red-950/60 border border-red-800/60 p-3 rounded-xl text-sm">
              <AlertCircle size={18} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300">كلمة مرور المزود</label>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="أدخل كلمة المرور..."
              className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'جاري التحقق...' : 'دخول إلى لوحة التحكم'}
          </button>
        </form>
      </div>
    )
  }

  const filteredDevices = selectedCustomerId === 'all'
    ? devices
    : devices.filter(d => (d.customerId || 'Customer_1') === selectedCustomerId)

  return (
    <div className="min-h-screen bg-slate-50 text-gray-800" dir="rtl">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center font-bold">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">لوحة تحكم المزود السحابية (محمية)</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-md font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  متصلة بسحابة Firebase
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => checkStatus()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm text-gray-700 font-medium transition-colors"
            >
              <RefreshCw size={14} />
              <span>تحديث</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-sm text-red-700 font-medium transition-colors"
            >
              <LogOut size={14} />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {error && (
          <div className="flex items-center gap-3 text-red-700 bg-red-50 border border-red-200 p-4 rounded-xl text-sm font-medium">
            <AlertCircle size={20} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="flex items-center gap-3 text-emerald-700 bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-sm font-medium">
            <CheckCircle size={20} className="shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* Global Lock Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 text-right">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${
              isLocked ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'
            }`}>
              {isLocked ? <Lock size={32} /> : <Unlock size={32} />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-gray-900">القفل العام للنظام (Global Remote Lock)</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  isLocked ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {isLocked ? 'النظام مقفل بالكامل' : 'النظام نشط ومفتوح للمرخصين فقط'}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                {isLocked
                  ? 'تم قفل البرنامج كلياً من السيرفر. جميع الأجهزة لدى جميع العملاء متوقفة حالياً.'
                  : 'البرنامج متاح للعمل للأجهزة المفعلة والمعتمدة فقط.'}
              </p>
            </div>
          </div>

          <button
            onClick={toggleLock}
            disabled={loading}
            className={`px-6 py-3 rounded-xl font-bold text-sm text-white shadow-md transition-all shrink-0 flex items-center gap-2 ${
              isLocked 
                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' 
                : 'bg-red-600 hover:bg-red-700 shadow-red-200'
            }`}
          >
            {isLocked ? (
              <>
                <Unlock size={18} />
                <span>إلغاء القفل العام وفتح النظام</span>
              </>
            ) : (
              <>
                <Lock size={18} />
                <span>قفل النظام بالكامل عن بعد</span>
              </>
            )}
          </button>
        </div>

        {/* Customer Databases Grid */}
        {customers.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Database size={20} className="text-indigo-600" />
              <span>قواعد بيانات العملاء المستقلة ({customers.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div 
                onClick={() => setSelectedCustomerId('all')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedCustomerId === 'all'
                    ? 'border-indigo-600 bg-indigo-50/60 shadow-sm'
                    : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900 text-sm">جميع العملاء</span>
                  <span className="text-xs bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full">
                    {devices.length} أجهزة
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">عرض جميع الأجهزة المسجلة</p>
              </div>

              {customers.map((c) => {
                const count = devices.filter(d => (d.customerId || 'Customer_1') === c.customerId).length
                const isSelected = selectedCustomerId === c.customerId
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedCustomerId(c.customerId)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/60 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Store size={16} className="text-indigo-600" />
                        <span className="font-bold text-gray-900 text-sm">{c.customerName || c.customerId}</span>
                      </div>
                      <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                        {count} أجهزة
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center justify-between">
                      <code>{c.customerId}</code>
                      {c.lastActive && <span>{new Date(c.lastActive).toLocaleDateString('ar-EG')}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Devices Licensing List Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Laptop size={20} className="text-indigo-600" />
                <span>قائمة الأجهزة وتراخيصها ({filteredDevices.length})</span>
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">
                يمكنك قفل أو فتح أي جهاز بصورة فورية بضغطة زر
              </p>
            </div>
            <div className="flex items-center gap-2">
              {devices.length > 0 && (
                <button
                  onClick={lockAllDevices}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 flex items-center gap-1.5 transition-colors"
                >
                  <ShieldAlert size={14} />
                  <span>قفل كل الأجهزة دفعة واحدة</span>
                </button>
              )}
              {selectedCustomerId !== 'all' && (
                <button
                  onClick={() => setSelectedCustomerId('all')}
                  className="text-xs font-semibold text-indigo-600 hover:underline px-2"
                >
                  عرض كل الأجهزة
                </button>
              )}
            </div>
          </div>

          {filteredDevices.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Laptop size={48} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">لم يتم تسجيل أي جهاز حتى الآن</p>
              <p className="text-xs text-gray-400 mt-1">عند تشغيل البرنامج على أي جهاز كمبيوتر سيظهر هنا فوراً للتحكم به وقفله أو فتحه</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filteredDevices.map((device) => (
                <div key={device.id} className="p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 mt-1 ${
                      device.isApproved ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-red-50 text-red-600 border border-red-200'
                    }`}>
                      <Laptop size={24} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-900 text-base">{device.hostname || 'كمبيوتر صيدلية'}</h3>
                        
                        {device.customerId && (
                          <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-0.5 rounded-md">
                            <Store size={12} />
                            {device.customerName || device.customerId}
                          </span>
                        )}
                        
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          device.isApproved ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {device.isApproved ? <CheckCircle size={12} /> : <XCircle size={12} />}
                          {device.isApproved ? 'مفتوح (مرخص ومفعل)' : 'مقفل (محظور)'}
                        </span>
                      </div>
                      <div className="mt-1.5 space-y-0.5 text-xs text-gray-500 font-mono">
                        <p><span className="font-sans font-semibold text-gray-700">بصمة الجهاز (Machine ID):</span> <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-800 font-bold">{device.id}</code></p>
                        {device.osInfo && <p><span className="font-sans text-gray-500">نظام التشغيل:</span> {device.osInfo}</p>}
                        {device.lastSeen && <p><span className="font-sans text-gray-500">آخر ظهور:</span> {new Date(device.lastSeen).toLocaleString('ar-EG')}</p>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                    <button
                      onClick={() => toggleDevice(device.id, !!device.isApproved)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                        device.isApproved
                          ? 'bg-red-100 text-red-800 hover:bg-red-200'
                          : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
                      }`}
                    >
                      {device.isApproved ? (
                        <>
                          <Lock size={14} />
                          <span>قفل الجهاز</span>
                        </>
                      ) : (
                        <>
                          <Unlock size={14} />
                          <span>فتح وترخيص الجهاز</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => deleteDevice(device.id)}
                      className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="حذف من القائمة"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App
