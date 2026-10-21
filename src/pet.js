const pet = document.querySelector('#pet')
const status = document.querySelector('#status')
const voice = document.querySelector('#voice')
const todo = document.querySelector('#todo')
const todoCount = document.querySelector('#todo-count')
const chat = document.querySelector('#chat')
const full = document.querySelector('#full')
const retry = document.querySelector('#retry')
const quit = document.querySelector('#quit')

function paint(state) {
  status.dataset.online = state.online ? 'yes' : 'no'
  status.textContent = state.online
    ? (state.chatVisible ? '迷你对话已打开' : 'DSH 在线 · 点 💬 聊天')
    : 'DSH 未启动 · 点 ↻ 重试'
  pet.classList.toggle('awake', Boolean(state.online))
  chat.classList.toggle('active', Boolean(state.chatVisible))
  todo.classList.toggle('active', Boolean(state.todoVisible))
  const count = Number(state.todoRemaining) || 0
  todoCount.hidden = count === 0
  todoCount.textContent = count > 99 ? '99+' : String(count)
}

// The pet is an Electron native drag region. Keeping click actions in the
// separate no-drag toolbar prevents long drags from turning into image drags
// or accidental chat toggles.
pet.addEventListener('dragstart', event => event.preventDefault())
voice.addEventListener('click', () => void window.deskDsh.toggleVoiceSettings?.())
todo.addEventListener('click', () => void window.deskDsh.toggleTodo())
chat.addEventListener('click', () => void window.deskDsh.toggleChat())
full.addEventListener('click', () => void window.deskDsh.openFull())
retry.addEventListener('click', () => void window.deskDsh.retry())
quit.addEventListener('click', () => void window.deskDsh.quit())

void window.deskDsh.getState().then(paint)
window.deskDsh.onState(paint)
