const API = 'https://api.frankfurter.dev/v2'

// Only these three currencies are offered in the UI.
const CURRENCIES = [
  { code: 'RUB', name: 'Российский рубль', symbol: '₽' },
  { code: 'USD', name: 'Доллар США', symbol: '$' },
  { code: 'EUR', name: 'Евро', symbol: '€' },
]

const fromAmt = document.getElementById('fromAmount')
const toAmt = document.getElementById('toAmount')
const fromSymbol = document.getElementById('fromSymbol')
const toSymbol = document.getElementById('toSymbol')
const strip = document.getElementById('strip')
const rateLine = document.getElementById('rateLine')
const dateLine = document.getElementById('dateLine')
const errorBox = document.getElementById('errorBox')
const swapBtn = document.getElementById('swapBtn')
const clock = document.getElementById('clock')

let currentRate = null
let lastEdited = 'from'

/* ---------------------------------------------------------------
   Кастомный селектор: триггер + собственный выпадающий список,
   с клавиатурной навигацией и ролями listbox/option.
   --------------------------------------------------------------- */
function createSelect(host, items, initial, onChange) {
  const field = host.closest('.field')
  let value = initial
  let open = false

  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'select-trigger'
  trigger.setAttribute('aria-haspopup', 'listbox')
  trigger.setAttribute('aria-expanded', 'false')
  if (host.dataset.label) trigger.setAttribute('aria-label', host.dataset.label)

  const triggerSymbol = document.createElement('span')
  triggerSymbol.className = 'select-symbol'
  const triggerCode = document.createElement('span')
  triggerCode.className = 'select-code'
  const chevron = document.createElement('span')
  chevron.className = 'select-chevron'
  trigger.append(triggerSymbol, triggerCode, chevron)

  const menu = document.createElement('div')
  menu.className = 'select-menu'
  menu.setAttribute('role', 'listbox')
  if (host.dataset.label) menu.setAttribute('aria-label', host.dataset.label)

  const optionEls = items.map((item) => {
    const opt = document.createElement('div')
    opt.className = 'select-option'
    opt.setAttribute('role', 'option')
    opt.tabIndex = -1
    opt.dataset.value = item.code

    const sym = document.createElement('span')
    sym.className = 'opt-symbol'
    sym.textContent = item.symbol
    const code = document.createElement('span')
    code.className = 'opt-code'
    code.textContent = item.code
    const name = document.createElement('span')
    name.className = 'opt-name'
    name.textContent = item.name
    const tick = document.createElement('span')
    tick.className = 'opt-tick'

    opt.append(sym, code, name, tick)
    opt.addEventListener('click', () => {
      setValue(item.code)
      close(true)
      onChange(value)
    })
    menu.appendChild(opt)
    return opt
  })

  host.append(trigger, menu)

  function render() {
    const item = items.find((i) => i.code === value)
    triggerSymbol.textContent = item.symbol
    triggerCode.textContent = item.code
    for (const opt of optionEls) {
      const on = opt.dataset.value === value
      opt.classList.toggle('is-selected', on)
      opt.setAttribute('aria-selected', String(on))
    }
  }

  function setValue(next) {
    if (!items.some((i) => i.code === next)) return
    value = next
    render()
  }

  function openMenu() {
    if (open) return
    closeOthers()
    open = true
    host.classList.add('open')
    field && field.classList.add('is-raised')
    trigger.setAttribute('aria-expanded', 'true')
    const active =
      optionEls.find((o) => o.dataset.value === value) || optionEls[0]
    active.focus()
  }

  function close(focusTrigger) {
    if (!open) return
    open = false
    host.classList.remove('open')
    field && field.classList.remove('is-raised')
    trigger.setAttribute('aria-expanded', 'false')
    if (focusTrigger) trigger.focus()
  }

  function move(step) {
    const idx = optionEls.indexOf(document.activeElement)
    const base = idx === -1 ? 0 : idx + step
    const next = (base + optionEls.length) % optionEls.length
    optionEls[next].focus()
  }

  trigger.addEventListener('click', () => (open ? close(true) : openMenu()))
  // Enter/Space обрабатывает сама кнопка — её нативный click дойдёт до
  // обработчика выше. Перехватываем только стрелки.
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      openMenu()
    }
  })

  menu.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        move(1)
        break
      case 'ArrowUp':
        e.preventDefault()
        move(-1)
        break
      case 'Home':
        e.preventDefault()
        optionEls[0].focus()
        break
      case 'End':
        e.preventDefault()
        optionEls[optionEls.length - 1].focus()
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        document.activeElement.click()
        break
      case 'Escape':
        e.preventDefault()
        close(true)
        break
      case 'Tab':
        close(false)
        break
    }
  })

  host.addEventListener('focusout', (e) => {
    if (!host.contains(e.relatedTarget)) close(false)
  })

  const api = {
    get value() {
      return value
    },
    set value(v) {
      setValue(v)
    },
    close: () => close(false),
  }
  openSelects.push(api)
  render()
  return api
}

const openSelects = []
function closeOthers() {
  for (const s of openSelects) s.close()
}
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.select')) closeOthers()
})

const fromSel = createSelect(
  document.getElementById('fromCurrency'),
  CURRENCIES,
  'USD',
  onCurrencyChange,
)
const toSel = createSelect(
  document.getElementById('toCurrency'),
  CURRENCIES,
  'RUB',
  onCurrencyChange,
)

function symbolOf(code) {
  const item = CURRENCIES.find((c) => c.code === code)
  return item ? item.symbol : ''
}

function updateSymbols() {
  fromSymbol.textContent = symbolOf(fromSel.value)
  toSymbol.textContent = symbolOf(toSel.value)
}

function onCurrencyChange() {
  updateSymbols()
  fetchRate()
}

function showError(msg, retryFn) {
  if (!msg) {
    errorBox.innerHTML = ''
    errorBox.style.display = 'none'
    return
  }
  errorBox.innerHTML = ''
  errorBox.appendChild(document.createTextNode(msg))
  if (retryFn) {
    const btn = document.createElement('button')
    btn.className = 'retry'
    btn.textContent = 'Повторить'
    btn.onclick = retryFn
    errorBox.appendChild(document.createElement('br'))
    errorBox.appendChild(btn)
  }
  errorBox.style.display = 'block'
}

function tickClock() {
  const now = new Date()
  clock.textContent = now.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}
tickClock()
setInterval(tickClock, 1000)

async function fetchJSON(url, ms = 8000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) {
      let detail = ''
      try {
        detail = (await res.json()).message || ''
      } catch (_) {}
      throw new Error(detail || `HTTP ${res.status}`)
    }
    return await res.json()
  } finally {
    clearTimeout(id)
  }
}

async function fetchRate() {
  const base = fromSel.value
  const target = toSel.value

  if (base === target) {
    currentRate = 1
    strip.classList.remove('loading')
    rateLine.innerHTML = `1 ${base} = 1 ${target}`
    dateLine.textContent = ''
    showError('')
    recompute()
    return
  }

  strip.classList.add('loading')
  rateLine.textContent = 'курс загружается…'
  showError('')

  try {
    // GET /v2/rate/{base}/{quote} -> { date, base, quote, rate }
    const data = await fetchJSON(`${API}/rate/${base}/${target}`)
    currentRate = data.rate
    rateLine.innerHTML = `1 ${base} = <span class="rate">${formatNumber(currentRate)}</span> ${target}`
    dateLine.textContent = data.date ? `на ${formatRuDate(data.date)}` : ''
    recompute()
  } catch (e) {
    rateLine.textContent = 'курс недоступен'
    showError('Не удалось получить курс: ' + e.message, fetchRate)
  } finally {
    strip.classList.remove('loading')
  }
}

// "2026-09-04" (формат API) -> "04.09.2026" (русский формат).
function formatRuDate(isoDate) {
  const [y, m, d] = isoDate.split('-')
  if (!y || !m || !d) return isoDate
  return `${d}.${m}.${y}`
}

function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return round(n).toLocaleString('ru-RU', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

/* ---------------------------------------------------------------
   Форматирование сумм в полях ввода: разряды разделяются пробелом
   (например 8685 -> "8 685"), при этом поля остаются обычным текстом,
   чтобы пробел вообще можно было туда вставить (type="number" его не
   пропускает).
   --------------------------------------------------------------- */
function groupThousands(intStr) {
  const negative = intStr.startsWith('-')
  const digits = negative ? intStr.slice(1) : intStr
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return negative ? '-' + grouped : grouped
}

// Числовое значение -> отформатированная строка для отображения.
function formatAmountValue(n) {
  if (n === null || n === undefined || isNaN(n)) return ''
  const [intPart, decPart] = String(n).split('.')
  const grouped = groupThousands(intPart)
  return decPart !== undefined ? `${grouped}.${decPart}` : grouped
}

// Строка из поля ввода -> число (пробелы-разделители и запятая как
// десятичный разделитель убираются перед парсингом).
function parseAmount(str) {
  const cleaned = String(str).replace(/\s+/g, '').replace(',', '.')
  const val = parseFloat(cleaned)
  return isNaN(val) ? 0 : val
}

// Произвольный ввод пользователя -> очищенная и сгруппированная строка
// (лишние буквы и вторая точка отбрасываются, пробелы расставляются
// заново по актуальной длине целой части).
function cleanAndGroup(raw) {
  const negative = raw.trim().startsWith('-')
  let s = raw.replace(/-/g, '').replace(/,/g, '.')
  const firstDot = s.indexOf('.')
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '')
  }
  let [intPart, decPart] = s.split('.')
  intPart = (intPart || '').replace(/\D/g, '')
  let out = groupThousands(intPart)
  if (decPart !== undefined) out += '.' + decPart.replace(/\D/g, '')
  return negative ? '-' + out : out
}

// Переформатирует поле по ходу набора, сохраняя положение курсора
// относительно значащих символов (цифры, точка, минус) — иначе при
// появлении нового пробела-разделителя курсор скакал бы в конец.
function reformatKeepingCaret(input, formatter) {
  const oldValue = input.value
  const oldPos = input.selectionStart ?? oldValue.length
  const before = oldValue.slice(0, oldPos).replace(/[^\d.,-]/g, '').length

  const newValue = formatter(oldValue)
  input.value = newValue

  let seen = 0
  let pos = newValue.length
  for (let i = 0; i < newValue.length; i++) {
    if (/[\d.,-]/.test(newValue[i])) seen++
    if (seen === before) {
      pos = i + 1
      break
    }
  }
  input.setSelectionRange(pos, pos)
}

function recompute() {
  if (currentRate === null) return
  if (lastEdited === 'from') {
    const val = parseAmount(fromAmt.value)
    toAmt.value = formatAmountValue(round(val * currentRate))
  } else {
    const val = parseAmount(toAmt.value)
    fromAmt.value = formatAmountValue(round(val / currentRate))
  }
}

// Rounds to 1 decimal place. If the true value is non-zero but rounds
// down to 0.0, floor it to the smallest visible unit (±0.1) instead,
// so a real (if tiny) amount never displays as zero.
function round(n) {
  if (n === 0) return 0
  const r = Math.round(n * 10) / 10
  if (r === 0) {
    return n > 0 ? 0.1 : -0.1
  }
  return r
}

fromAmt.addEventListener('input', () => {
  reformatKeepingCaret(fromAmt, cleanAndGroup)
  lastEdited = 'from'
  recompute()
})
toAmt.addEventListener('input', () => {
  reformatKeepingCaret(toAmt, cleanAndGroup)
  lastEdited = 'to'
  recompute()
})

swapBtn.addEventListener('click', () => {
  swapBtn.classList.add('spin')
  setTimeout(() => swapBtn.classList.remove('spin'), 400)
  const tmp = fromSel.value
  fromSel.value = toSel.value
  toSel.value = tmp
  lastEdited = 'from'
  updateSymbols()
  fetchRate()
})

updateSymbols()
fetchRate()
