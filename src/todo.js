const list = document.querySelector('#todos')
const empty = document.querySelector('#empty')
const summary = document.querySelector('#summary')
const form = document.querySelector('#add-form')
const input = document.querySelector('#new-todo')
const close = document.querySelector('#close')
let items = []

function beginEdit(item, textElement) {
  const editor = document.createElement('input')
  editor.className = 'edit'
  editor.maxLength = 240
  editor.value = item.text
  textElement.replaceWith(editor)
  editor.focus()
  editor.select()
  let finished = false
  const finish = async save => {
    if (finished) return
    finished = true
    const value = editor.value.trim()
    if (save && value && value !== item.text) await window.deskDshTodo.update(item.id, value)
    else render(items)
  }
  editor.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); void finish(true) }
    if (event.key === 'Escape') { event.preventDefault(); void finish(false) }
  })
  editor.addEventListener('blur', () => void finish(true))
}

function render(next) {
  items = Array.isArray(next) ? next : []
  list.replaceChildren()
  const remaining = items.filter(item => !item.completed).length
  summary.textContent = `${remaining} 项待办 · 共 ${items.length} 项`
  empty.hidden = items.length !== 0
  for (const item of items) {
    const row = document.createElement('li')
    row.className = `todo${item.completed ? ' completed' : ''}`
    const check = document.createElement('button')
    check.className = 'check'
    check.type = 'button'
    check.title = item.completed ? '恢复为未完成' : '划掉任务'
    check.textContent = '✓'
    check.addEventListener('click', () => void window.deskDshTodo.toggle(item.id))
    const text = document.createElement('span')
    text.className = 'text'
    text.textContent = item.text
    text.title = '双击编辑'
    text.addEventListener('dblclick', () => beginEdit(item, text))
    const remove = document.createElement('button')
    remove.className = 'delete'
    remove.type = 'button'
    remove.title = '永久删除'
    remove.textContent = '×'
    remove.addEventListener('click', () => void window.deskDshTodo.remove(item.id))
    row.append(check, text, remove)
    list.append(row)
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault()
  const text = input.value.trim()
  if (!text) return
  input.disabled = true
  try {
    await window.deskDshTodo.add(text)
    input.value = ''
  } finally {
    input.disabled = false
    input.focus()
  }
})
close.addEventListener('click', () => void window.deskDshTodo.close())
void window.deskDshTodo.list().then(render)
window.deskDshTodo.onChanged(render)
