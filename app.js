// ==========================================
// ИНИЦИАЛИЗАЦИЯ SUPABASE
// ==========================================
const SUPABASE_URL = 'https://txwvecjacvvrighfmpgp.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR4d3ZlY2phY3Z2cmlnaGZtcGdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4MjU2MzAsImV4cCI6MjA5MjQwMTYzMH0.K--QPJnexeaJ5CIoFGRdkG4OMPNUwp_umoILc-i5L-c';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================
let currentUser = null;
let currentProfile = null;
let currentOrderId = null;
let charts = {};

// ==========================================
// КОНСТАНТЫ
// ==========================================
const STATUS_LABELS = {
  on_way: 'В пути',
  in_work: 'В работе',
  done: 'Завершена',
  taken_equipment: 'Взял технику'
};

const TYPE_LABELS = {
  household: 'Бытовая техника',
  computer: 'Компьютерная техника'
};

const MASTER_STATUS_LABELS = {
  free: 'Свободен',
  assigned: 'Назначен',
  working: 'В работе',
  dayoff: 'Выходной'
};

const MASTER_PROFILE_LABELS = {
  household: 'Бытовая техника',
  computer: 'Компьютерная техника',
  both: 'Оба профиля'
};

const ROLE_LABELS = {
  admin: 'Администратор',
  dispatcher: 'Диспетчер'
};

// ==========================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    await initApp(session.user);
  } else {
    showScreen('login-screen');
  }

  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await initApp(session.user);
    } else if (event === 'SIGNED_OUT') {
      showScreen('login-screen');
    }
  });

  // Дата на дашборде
  const now = new Date();
  const dateEl = document.getElementById('dashboard-date');
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('ru-RU', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  // Даты для статистики
  const today = new Date().toISOString().split('T')[0];
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const statsFrom = document.getElementById('stats-from');
  const statsTo = document.getElementById('stats-to');
  if (statsFrom) statsFrom.value = monthAgo;
  if (statsTo) statsTo.value = today;
});

async function initApp(user) {
  currentUser = user;
  const { data: profile } = await sb
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  currentProfile = profile;

  if (profile) {
    document.getElementById('user-name').textContent = profile.full_name;
    document.getElementById('user-role').textContent = ROLE_LABELS[profile.role] || profile.role;

    // Скрыть админские пункты меню для диспетчеров
    if (profile.role !== 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    }
  }

  showScreen('main-screen');
  showPage('dashboard');
  loadDashboard();
}

// ==========================================
// НАВИГАЦИЯ
// ==========================================
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(id);
  if (screen) screen.classList.add('active');
}

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(page)) {
      item.classList.add('active');
    }
  });

  // Загружаем данные для страницы
  if (page === 'dashboard') loadDashboard();
  if (page === 'orders') loadOrders();
  if (page === 'clients') loadClients();
  if (page === 'masters') loadMasters();
  if (page === 'stats') loadStats();
  if (page === 'logs') loadLogs();
  if (page === 'users') loadUsers();
}

// ==========================================
// АВТОРИЗАЦИЯ
// ==========================================
async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');

  if (!email || !password) {
    errorEl.textContent = 'Введите email и пароль';
    return;
  }

  const { data, error } = await sb.auth.signInWithPassword({ email, password });

  if (error) {
    errorEl.textContent = 'Неверный email или пароль';
    return;
  }

  errorEl.textContent = '';
}

async function logout() {
  await sb.auth.signOut();
  currentUser = null;
  currentProfile = null;
  showScreen('login-screen');
}

// ==========================================
// ДАШБОРД
// ==========================================
async function loadDashboard() {
  const today = new Date().toISOString().split('T')[0];

  // Все заявки
  const { data: allOrders } = await sb.from('orders').select('*');
  const { data: todayOrders } = await sb.from('orders')
    .select('*')
    .gte('created_at', today);

  const active = allOrders ? allOrders.filter(o =>
    ['on_way', 'in_work', 'taken_equipment'].includes(o.status)) : [];
  const doneToday = todayOrders ? todayOrders.filter(o => o.status === 'done') : [];
  const revenueToday = doneToday.reduce((s, o) => s + (o.total_amount || 0), 0);
  const cashToday = doneToday.reduce((s, o) => s + (o.cash_payment || 0), 0);

  const doneAll = allOrders ? allOrders.filter(o => o.status === 'done' && o.total_amount > 0) : [];
  const avgCheck = doneAll.length > 0
    ? Math.round(doneAll.reduce((s, o) => s + o.total_amount, 0) / doneAll.length)
    : 0;

  setEl('stat-total', allOrders ? allOrders.length : 0);
  setEl('stat-active', active.length);
  setEl('stat-done', doneToday ? doneToday.filter(o => o.status === 'done').length : 0);
  setEl('stat-revenue', formatMoney(revenueToday));
  setEl('stat-avg', formatMoney(avgCheck));
  setEl('stat-cash', formatMoney(cashToday));

  // Активные заявки
  const activeList = document.getElementById('active-orders-list');
  if (activeList) {
    if (active.length === 0) {
      activeList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div><p>Нет активных заявок</p></div>';
    } else {
      const { data: clients } = await sb.from('clients').select('id, full_name');
      const clientMap = {};
      if (clients) clients.forEach(c => clientMap[c.id] = c.full_name);

      activeList.innerHTML = active.slice(0, 5).map(o => `
        <div class="order-mini-item" onclick="viewOrder('${o.id}')" style="cursor:pointer">
          <div>
            <strong>#${o.order_number}</strong>
            <span style="margin-left:8px;color:var(--text-light)">${clientMap[o.client_id] || '—'}</span>
          </div>
          <span class="badge badge-${o.status}">${STATUS_LABELS[o.status]}</span>
        </div>
      `).join('');
    }
  }

  // Статус мастеров
  const { data: masters } = await sb.from('masters').select('*');
  const mastersList = document.getElementById('masters-status-list');
  if (mastersList && masters) {
    if (masters.length === 0) {
      mastersList.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👨‍🔧</div><p>Нет мастеров</p></div>';
    } else {
      mastersList.innerHTML = masters.map(m => `
        <div class="master-mini-item">
          <span>${m.full_name}</span>
          <span class="badge badge-${m.status}">${MASTER_STATUS_LABELS[m.status]}</span>
        </div>
      `).join('');
    }
  }
}

// ==========================================
// ЗАЯВКИ — ЗАГРУЗКА
// ==========================================
async function loadOrders() {
  const status = document.getElementById('filter-status')?.value || '';
  const type = document.getElementById('filter-type')?.value || '';
  const search = document.getElementById('filter-search')?.value?.toLowerCase() || '';

  let query = sb.from('orders')
    .select(`*, clients(full_name, phone, is_problem), masters(full_name), profiles(full_name)`)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);
  if (type) query = query.eq('type', type);

  const { data: orders, error } = await query;

  if (error) { showToast('Ошибка загрузки заявок', 'error'); return; }

  let filtered = orders || [];
  if (search) {
    filtered = filtered.filter(o =>
      o.clients?.full_name?.toLowerCase().includes(search) ||
      o.clients?.phone?.includes(search) ||
      o.address?.toLowerCase().includes(search) ||
      o.district?.toLowerCase().includes(search) ||
      String(o.order_number).includes(search)
    );
  }

  const container = document.getElementById('orders-list');
  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div><p>Заявок не найдено</p></div>';
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Тип</th>
          <th>Клиент</th>
          <th>Адрес / Район</th>
          <th>Мастер</th>
          <th>Статус</th>
          <th>Сумма</th>
          <th>Дата</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(o => `
          <tr>
            <td><strong>#${o.order_number}</strong></td>
            <td><span class="badge badge-${o.type}">${TYPE_LABELS[o.type]}</span></td>
            <td>
              ${o.clients?.full_name || '—'}
              ${o.is_repeat ? '<span class="badge badge-repeat" style="margin-left:4px">Повторная</span>' : ''}
              ${o.clients?.is_problem ? '<span class="badge badge-problem" style="margin-left:4px">⚠️</span>' : ''}
            </td>
            <td>
              <div>${o.address || '—'}</div>
              <div style="font-size:12px;color:var(--text-light)">${o.district || '—'}</div>
            </td>
            <td>${o.masters?.full_name || '—'}</td>
            <td><span class="badge badge-${o.status}">${STATUS_LABELS[o.status]}</span></td>
            <td>${o.total_amount > 0 ? formatMoney(o.total_amount) : '—'}</td>
            <td style="font-size:12px">${formatDate(o.created_at)}</td>
            <td>
              <div class="table-actions">
                <button class="btn-icon" onclick="viewOrder('${o.id}')" title="Просмотр">👁️</button>
                <button class="btn-icon" onclick="openOrderModal('${o.id}')" title="Редактировать">✏️</button>
                ${currentProfile?.role === 'admin' ? `<button class="btn-icon" onclick="deleteOrder('${o.id}')" title="Удалить">🗑️</button>` : ''}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ==========================================
// ЗАЯВКИ — ПРОСМОТР
// ==========================================
async function viewOrder(id) {
  const { data: order } = await sb.from('orders')
    .select(`*, clients(*), masters(full_name), profiles(full_name)`)
    .eq('id', id)
    .single();

  if (!order) return;

  const { data: photos } = await sb.from('order_photos')
    .select('*')
    .eq('order_id', id);

  currentOrderId = id;

  document.getElementById('view-order-title').textContent = `Заявка #${order.order_number}`;

  document.getElementById('view-order-body').innerHTML = `
    <div class="view-section">
      <h4>Основная информация</h4>
      <div class="view-row"><span class="label">Тип</span><span class="value">${TYPE_LABELS[order.type]}</span></div>
      <div class="view-row"><span class="label">Статус</span><span class="value"><span class="badge badge-${order.status}">${STATUS_LABELS[order.status]}</span></span></div>
      <div class="view-row"><span class="label">Повторная</span><span class="value">${order.is_repeat ? '✅ Да' : 'Нет'}</span></div>
      <div class="view-row"><span class="label">Диспетчер</span><span class="value">${order.profiles?.full_name || '—'}</span></div>
      <div class="view-row"><span class="label">Дата создания</span><span class="value">${formatDate(order.created_at)}</span></div>
    </div>

    <div class="view-section">
      <h4>Клиент</h4>
      <div class="view-row"><span class="label">ФИО</span><span class="value">${order.clients?.full_name || '—'}</span></div>
      <div class="view-row"><span class="label">Телефон</span><span class="value">${order.clients?.phone || '—'}</span></div>
      <div class="view-row"><span class="label">Адрес</span><span class="value">${order.address || '—'}</span></div>
      <div class="view-row"><span class="label">Район</span><span class="value">${order.district || '—'}</span></div>
      ${order.clients?.is_problem ? `<div class="view-row"><span class="label">⚠️ Проблемный</span><span class="value" style="color:var(--danger)">${order.clients.problem_reason || 'Да'}</span></div>` : ''}
    </div>

    <div class="view-section">
      <h4>Мастер</h4>
      <div class="view-row"><span class="label">Мастер</span><span class="value">${order.masters?.full_name || '—'}</span></div>
      <div class="view-row"><span class="label">% мастеру</span><span class="value">${order.master_percent}%</span></div>
    </div>

    <div class="view-section">
      <h4>Финансы</h4>
      <div class="view-row"><span class="label">Общая сумма</span><span class="value">${formatMoney(order.total_amount)}</span></div>
      <div class="view-row"><span class="label">Запчасти</span><span class="value">${formatMoney(order.parts_amount)}</span></div>
      <div class="view-row"><span class="label">Чистая сумма</span><span class="value">${formatMoney(order.net_amount)}</span></div>
      <div class="view-row"><span class="label">Мастеру</span><span class="value" style="color:var(--success)">${formatMoney(order.master_payment)}</span></div>
      <div class="view-row"><span class="label">В кассу</span><span class="value" style="color:var(--primary)">${formatMoney(order.cash_payment)}</span></div>
    </div>

    ${order.notes ? `
    <div class="view-section">
      <h4>Примечания</h4>
      <p style="font-size:14px">${order.notes}</p>
    </div>` : ''}

    ${photos && photos.length > 0 ? `
    <div class="view-section">
      <h4>Фото</h4>
      <div class="view-photos">
        ${photos.map(p => `<img src="${p.url}" onclick="window.open('${p.url}', '_blank')">`).join('')}
      </div>
    </div>` : ''}
  `;

  openModal('modal-view-order');
}

function editCurrentOrder() {
  closeModal('modal-view-order');
  if (currentOrderId) openOrderModal(currentOrderId);
}
