/* ===== Supabase Config ===== */
const SUPABASE_URL = window.__KANBAN_CONFIG__?.url ?? '__SUPABASE_URL__';
const SUPABASE_ANON_KEY = window.__KANBAN_CONFIG__?.key ?? '__SUPABASE_ANON_KEY__';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ===== Constants ===== */
const COLUMNS = ['todo', 'in-progress', 'done'];

/* ===== State ===== */
let state = {
  'todo': [],
  'in-progress': [],
  'done': []
};

/* ===== Utils ===== */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, isError = false) {
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' toast--error' : '');
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3000);
}

/* ===== Loading ===== */
function setLoading(isLoading) {
  document.querySelector('.board').classList.toggle('is-loading', isLoading);
}

/* ===== Supabase Operations ===== */
async function loadState() {
  setLoading(true);
  const { data, error } = await db
    .from('cards')
    .select('*')
    .order('position', { ascending: true });
  setLoading(false);

  if (error) {
    showToast('데이터를 불러오지 못했습니다: ' + error.message, true);
    return;
  }

  COLUMNS.forEach(col => { state[col] = []; });
  data.forEach(row => {
    state[row.column_name].push({ id: row.id, text: row.text, createdAt: row.created_at });
  });
}

async function addCard(col, text) {
  const position = state[col].length;
  const { data, error } = await db
    .from('cards')
    .insert({ column_name: col, text: text.trim(), position })
    .select()
    .single();

  if (error) {
    showToast('카드를 추가하지 못했습니다: ' + error.message, true);
    return;
  }

  state[col].push({ id: data.id, text: data.text, createdAt: data.created_at });
  renderAll();
}

async function deleteCard(col, id) {
  const { error } = await db.from('cards').delete().eq('id', id);

  if (error) {
    showToast('카드를 삭제하지 못했습니다: ' + error.message, true);
    return;
  }

  state[col] = state[col].filter(c => c.id !== id);
  renderAll();
}

async function moveCard(fromCol, toCol, id, newIdx) {
  const cardIdx = state[fromCol].findIndex(c => c.id === id);
  if (cardIdx === -1) return;

  const [card] = state[fromCol].splice(cardIdx, 1);
  state[toCol].splice(newIdx, 0, card);

  const affectedCols = fromCol === toCol ? [fromCol] : [fromCol, toCol];
  const updates = [];
  affectedCols.forEach(col => {
    state[col].forEach((c, idx) => {
      updates.push(
        db.from('cards').update({ column_name: col, position: idx }).eq('id', c.id)
      );
    });
  });

  const results = await Promise.all(updates);
  const failed = results.find(r => r.error);
  if (failed) {
    showToast('카드 이동을 저장하지 못했습니다: ' + failed.error.message, true);
  }

  COLUMNS.forEach(col => {
    const cardList = document.getElementById(`cards-${col}`);
    const hasEmptyHint = cardList.querySelector('.empty-hint');
    const hasCards = state[col].length > 0;
    if (hasCards && hasEmptyHint) {
      cardList.removeChild(hasEmptyHint);
    } else if (!hasCards && !hasEmptyHint) {
      const hint = document.createElement('div');
      hint.className = 'empty-hint';
      hint.innerHTML = `
        <span class="material-symbols-rounded">${EMPTY_ICONS[col]}</span>
        <span>${EMPTY_LABELS[col]}</span>
      `;
      cardList.appendChild(hint);
    }
  });
  updateBadges();
}

/* ===== Render ===== */
const EMPTY_ICONS = {
  'todo':        'inbox',
  'in-progress': 'hourglass_empty',
  'done':        'check_circle'
};

const EMPTY_LABELS = {
  'todo':        '할 일을 추가해 보세요',
  'in-progress': '진행 중인 작업이 없습니다',
  'done':        '완료된 작업이 없습니다'
};

function createCardEl(card) {
  const article = document.createElement('article');
  article.className = 'card';
  article.dataset.id = card.id;
  article.setAttribute('role', 'listitem');
  article.setAttribute('tabindex', '0');
  article.innerHTML = `
    <p class="card__text">${escapeHtml(card.text)}</p>
    <div class="card__actions">
      <button class="card__delete-btn icon-btn" aria-label="카드 삭제">
        <span class="material-symbols-rounded">delete_outline</span>
      </button>
    </div>
  `;
  return article;
}

function renderColumn(col) {
  const cardList = document.getElementById(`cards-${col}`);
  const badge = document.querySelector(`#col-${col} .column__count`);

  cardList.innerHTML = '';
  badge.textContent = state[col].length;

  if (state[col].length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-hint';
    hint.innerHTML = `
      <span class="material-symbols-rounded">${EMPTY_ICONS[col]}</span>
      <span>${EMPTY_LABELS[col]}</span>
    `;
    cardList.appendChild(hint);
  } else {
    state[col].forEach(card => {
      cardList.appendChild(createCardEl(card));
    });
  }
}

function renderAll() {
  COLUMNS.forEach(renderColumn);
}

function updateBadges() {
  COLUMNS.forEach(col => {
    document.querySelector(`#col-${col} .column__count`).textContent = state[col].length;
  });
}

/* ===== Sortable ===== */
function initSortable() {
  COLUMNS.forEach(col => {
    const el = document.getElementById(`cards-${col}`);
    Sortable.create(el, {
      group: 'kanban',
      animation: 150,
      easing: 'cubic-bezier(.4,0,.2,1)',
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      filter: '.empty-hint',
      delayOnTouchOnly: true,
      delay: 150,
      touchStartThreshold: 5,
      onEnd(evt) {
        const fromCol = evt.from.dataset.column;
        const toCol = evt.to.dataset.column;
        const cardId = evt.item.dataset.id;
        const newIdx = evt.newDraggableIndex;
        moveCard(fromCol, toCol, cardId, newIdx);
      }
    });
  });
}

/* ===== Modal ===== */
const modal = document.getElementById('card-modal');
const cardInput = document.getElementById('card-input');
const charCurrent = document.getElementById('char-current');
const modalConfirm = document.getElementById('modal-confirm');
const modalCancel = document.getElementById('modal-cancel');
const modalClose = document.getElementById('modal-close');
let activeColumn = null;

function openModal(col) {
  activeColumn = col;
  const colTitle = document.querySelector(`#col-${col} .column__title`).textContent;
  document.getElementById('modal-title').textContent = `새 카드 — ${colTitle}`;
  cardInput.value = '';
  charCurrent.textContent = '0';
  charCurrent.closest('.char-count').classList.remove('is-warning');
  modalConfirm.disabled = true;
  modal.classList.add('is-open');
  requestAnimationFrame(() => cardInput.focus());
}

function closeModal() {
  modal.classList.remove('is-open');
  activeColumn = null;
}

function confirmModal() {
  const text = cardInput.value.trim();
  if (!text || !activeColumn) return;
  addCard(activeColumn, text);
  closeModal();
}

/* ===== Event Wiring ===== */
document.querySelector('.board').addEventListener('click', evt => {
  const deleteBtn = evt.target.closest('.card__delete-btn');
  if (deleteBtn) {
    const card = deleteBtn.closest('.card');
    const col = card.closest('.column__cards').dataset.column;
    deleteCard(col, card.dataset.id);
    return;
  }

  const addBtn = evt.target.closest('.add-card-btn');
  if (addBtn) {
    openModal(addBtn.dataset.column);
  }
});

modalConfirm.addEventListener('click', confirmModal);
modalCancel.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);

modal.addEventListener('click', evt => {
  if (evt.target === modal) closeModal();
});

cardInput.addEventListener('input', () => {
  const len = cardInput.value.length;
  charCurrent.textContent = len;
  charCurrent.closest('.char-count').classList.toggle('is-warning', len > 240);
  modalConfirm.disabled = cardInput.value.trim().length === 0;
});

cardInput.addEventListener('keydown', evt => {
  if (evt.key === 'Enter' && !evt.shiftKey) {
    evt.preventDefault();
    confirmModal();
  }
  if (evt.key === 'Escape') {
    closeModal();
  }
});

document.addEventListener('keydown', evt => {
  if (evt.key === 'Escape' && modal.classList.contains('is-open')) {
    closeModal();
  }
});

/* ===== Init ===== */
async function init() {
  await loadState();
  renderAll();
  initSortable();
}

init();
