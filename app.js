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

// ==========================================
// ИСПРАВЛЕНИЕ ОШИБОК МОДАЛЬНЫХ ОКОН
// ==========================================

// Переопределяем функции для модалок (должны быть глобальными)
window.openOrderModal = async function(id = null) {
  currentOrderId = id;
  document.getElementById('modal-order-title').textContent = id ? 'Редактировать заявку' : 'Новая заявка';
  document.getElementById('calc-result').classList.remove('visible');
  document.getElementById('photos-preview').innerHTML = '';
  document.getElementById('client-warning').className = 'client-warning hidden';

  // Загружаем мастеров
  const { data: masters } = await sb.from('masters').select('*').order('full_name');
  const masterSelect = document.getElementById('order-master');
  masterSelect.innerHTML = '<option value="">— Выбрать мастера —</option>' +
    (masters || []).map(m => `<option value="${m.id}">${m.full_name} (${MASTER_PROFILE_LABELS[m.profile]})</option>`).join('');

  if (id) {
    const { data: order } = await sb.from('orders')
      .select(`*, clients(*)`)
      .eq('id', id)
      .single();

    if (order) {
      document.getElementById('order-type').value = order.type || 'household';
      document.getElementById('order-master').value = order.master_id || '';
      document.getElementById('order-client-name').value = order.clients?.full_name || '';
      document.getElementById('order-client-phone').value = order.clients?.phone || '';
      document.getElementById('order-address').value = order.address || '';
      document.getElementById('order-district').value = order.district || '';
      document.getElementById('order-notes').value = order.notes || '';
      document.getElementById('order-total').value = order.total_amount || '';
      document.getElementById('order-parts').value = order.parts_amount || '';
      document.getElementById('order-percent').value = order.master_percent || 50;
      document.getElementById('order-status').value = order.status || 'on_way';
      calcOrder();

      // Загружаем фото
      const { data: photos } = await sb.from('order_photos')
        .select('*').eq('order_id', id);
      if (photos && photos.length > 0) {
        const preview = document.getElementById('photos-preview');
        preview.innerHTML = photos.map(p =>
          `<img src="${p.url}" onclick="window.open('${p.url}','_blank')">`
        ).join('');
      }
    }
  } else {
    // Сброс формы
    document.getElementById('order-type').value = 'household';
    document.getElementById('order-master').value = '';
    document.getElementById('order-client-name').value = '';
    document.getElementById('order-client-phone').value = '';
    document.getElementById('order-address').value = '';
    document.getElementById('order-district').value = '';
    document.getElementById('order-notes').value = '';
    document.getElementById('order-total').value = '';
    document.getElementById('order-parts').value = '';
    document.getElementById('order-percent').value = 50;
    document.getElementById('order-status').value = 'on_way';
  }

  openModal('modal-order');
};

window.openMasterModal = async function(id = null) {
  document.getElementById('modal-master-title').textContent = id ? 'Редактировать мастера' : 'Новый мастер';

  if (id) {
    const { data: master } = await sb.from('masters').select('*').eq('id', id).single();
    if (master) {
      document.getElementById('master-name').value = master.full_name;
      document.getElementById('master-phone').value = master.phone || '';
      document.getElementById('master-profile').value = master.profile;
      document.getElementById('master-status').value = master.status;
      document.getElementById('master-percent').value = master.default_percent || 50;
    }
  } else {
    document.getElementById('master-name').value = '';
    document.getElementById('master-phone').value = '';
    document.getElementById('master-profile').value = 'household';
    document.getElementById('master-status').value = 'free';
    document.getElementById('master-percent').value = 50;
  }

  currentOrderId = id;
  openModal('modal-master');
};

window.openUserModal = function() {
  document.getElementById('user-fullname').value = '';
  document.getElementById('user-email').value = '';
  document.getElementById('user-password').value = '';
  document.getElementById('user-role').value = 'dispatcher';
  openModal('modal-user');
};

// Исправляем сохранение заявки
window.saveOrder = async function() {
  const clientName = document.getElementById('order-client-name').value.trim();
  const clientPhone = document.getElementById('order-client-phone').value.trim();
  const address = document.getElementById('order-address').value.trim();
  const district = document.getElementById('order-district').value.trim();
  const masterId = document.getElementById('order-master').value;
  const type = document.getElementById('order-type').value;
  const status = document.getElementById('order-status').value;
  const total = parseFloat(document.getElementById('order-total').value) || 0;
  const parts = parseFloat(document.getElementById('order-parts').value) || 0;
  const percent = parseInt(document.getElementById('order-percent').value) || 50;
  const notes = document.getElementById('order-notes').value.trim();

  if (!clientName || !clientPhone || !address || !district) {
    showToast('Заполните обязательные поля', 'error');
    return;
  }

  if (!masterId) {
    showToast('Выберите мастера', 'error');
    return;
  }

  // Проверяем клиента
  let clientId = null;
  let isRepeat = false;

  const { data: existingClients } = await sb.from('clients')
    .select('*')
    .or(`phone.eq.${clientPhone},address.eq.${address}`);

  if (existingClients && existingClients.length > 0) {
    const existing = existingClients[0];
    clientId = existing.id;
    isRepeat = true;

    if (!currentOrderId) {
      await sb.from('clients')
        .update({ visits_count: (existing.visits_count || 1) + 1 })
        .eq('id', existing.id);
    }
  } else {
    const { data: newClient } = await sb.from('clients').insert({
      full_name: clientName,
      phone: clientPhone,
      address: address,
      district: district,
      visits_count: 1
    }).select().single();

    if (newClient) clientId = newClient.id;
  }

  const orderData = {
    type,
    status,
    is_repeat: isRepeat,
    client_id: clientId,
    master_id: masterId,
    dispatcher_id: currentUser.id,
    district,
    address,
    total_amount: total,
    parts_amount: parts,
    master_percent: percent,
    notes,
    completed_at: status === 'done' ? new Date().toISOString() : null
  };

  let orderId = currentOrderId;
  let oldData = null;

  if (currentOrderId) {
    const { data: old } = await sb.from('orders').select('*').eq('id', currentOrderId).single();
    oldData = old;
    await sb.from('orders').update(orderData).eq('id', currentOrderId);
  } else {
    const { data: newOrder } = await sb.from('orders').insert(orderData).select().single();
    if (newOrder) orderId = newOrder.id;
  }

  // Загружаем фото
  const photoInput = document.getElementById('order-photos');
  if (photoInput.files.length > 0 && orderId) {
    await uploadPhotos(photoInput.files, orderId);
  }

  // Обновляем статус мастера
  if (masterId) {
    let masterStatus = 'assigned';
    if (status === 'in_work') masterStatus = 'working';
    if (status === 'done' || status === 'taken_equipment') masterStatus = 'free';
    await sb.from('masters').update({ status: masterStatus }).eq('id', masterId);
  }

  await writeLog(
    currentOrderId ? 'Обновил заявку' : 'Создал заявку',
    'order',
    orderId,
    oldData,
    orderData
  );

  showToast(currentOrderId ? 'Заявка обновлена' : 'Заявка создана', 'success');
  closeModal('modal-order');
  loadOrders();
  loadDashboard();
};

// Исправляем сохранение мастера
window.saveMaster = async function() {
  const name = document.getElementById('master-name').value.trim();
  const phone = document.getElementById('master-phone').value.trim();
  const profile = document.getElementById('master-profile').value;
  const status = document.getElementById('master-status').value;
  const percent = parseInt(document.getElementById('master-percent').value) || 50;

  if (!name) {
    showToast('Введите ФИО мастера', 'error');
    return;
  }

  const masterData = {
    full_name: name,
    phone,
    profile,
    status,
    default_percent: percent
  };

  if (currentOrderId) {
    await sb.from('masters').update(masterData).eq('id', currentOrderId);
    await writeLog('Обновил мастера', 'master', currentOrderId, null, masterData);
    showToast('Мастер обновлён', 'success');
  } else {
    const { data: newMaster } = await sb.from('masters').insert(masterData).select().single();
    await writeLog('Добавил мастера', 'master', newMaster?.id, null, masterData);
    showToast('Мастер добавлен', 'success');
  }

  closeModal('modal-master');
  loadMasters();
};

// Исправляем сохранение пользователя
window.saveUser = async function() {
  const fullName = document.getElementById('user-fullname').value.trim();
  const email = document.getElementById('user-email').value.trim();
  const password = document.getElementById('user-password').value;
  const role = document.getElementById('user-role').value;

  if (!fullName || !email || !password) {
    showToast('Заполните все поля', 'error');
    return;
  }

  if (password.length < 6) {
    showToast('Пароль минимум 6 символов', 'error');
    return;
  }

  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error) {
    const { data: signUpData, error: signUpError } = await sb.auth.signUp({
      email,
      password
    });

    if (signUpError) {
      showToast('Ошибка создания пользователя: ' + signUpError.message, 'error');
      return;
    }

    if (signUpData.user) {
      await sb.from('profiles').insert({
        id: signUpData.user.id,
        full_name: fullName,
        role
      });
    }
  } else if (data.user) {
    await sb.from('profiles').insert({
      id: data.user.id,
      full_name: fullName,
      role
    });
  }

  await writeLog('Создал пользователя', 'user', null, null, { email, role });
  showToast('Пользователь создан', 'success');
  closeModal('modal-user');
  loadUsers();
};

// Добавляем функции просмотра и удаления в window
window.viewOrder = async function(id) {
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
};

window.editCurrentOrder = function() {
  closeModal('modal-view-order');
  if (currentOrderId) openOrderModal(currentOrderId);
};

window.deleteOrder = async function(id) {
  if (!confirm('Удалить заявку? Это действие нельзя отменить.')) return;

  await sb.from('order_photos').delete().eq('order_id', id);
  await sb.from('orders').delete().eq('id', id);
  await writeLog('Удалил заявку', 'order', id, null, null);

  showToast('Заявка удалена', 'success');
  loadOrders();
  loadDashboard();
};

window.toggleProblemClient = async function(id, isProblem) {
  if (!isProblem) {
    const reason = prompt('Укажите причину (проблемный клиент):');
    if (reason === null) return;
    await sb.from('clients').update({
      is_problem: true,
      problem_reason: reason
    }).eq('id', id);
    await writeLog('Пометил клиента как проблемного', 'client', id, null, { reason });
    showToast('Клиент помечен как проблемный', 'warning');
  } else {
    if (!confirm('Снять пометку "проблемный клиент"?')) return;
    await sb.from('clients').update({
      is_problem: false,
      problem_reason: null
    }).eq('id', id);
  
}
