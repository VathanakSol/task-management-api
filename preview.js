const $ = (selector) => document.querySelector(selector);
const state = { mode: 'demo', tasks: [], nextId: 1, selected: null, response: null };
const samples = [
  { title: 'Review pull request', description: 'Check validation and tests', status: 'in_progress', due_date: '2026-12-18' },
  { title: 'Write release notes', description: 'Summarize API changes', status: 'todo', due_date: '2026-12-22' },
  { title: 'Update documentation', description: 'Add endpoint examples', status: 'done', due_date: null }
];
const clone = (value) => JSON.parse(JSON.stringify(value));
const now = () => new Date().toISOString();
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function log(message) { $('#eventLog').textContent = `${new Date().toLocaleTimeString()}  ${message}\n${$('#eventLog').textContent}`; }
function resetDemo() {
  state.nextId = 1;
  state.tasks = samples.map((sample) => ({ ...clone(sample), id: state.nextId++, created_at: now(), updated_at: now() }));
  state.selected = null;
  renderTasks();
  log('Demo data reset. No API database was changed.');
}
function renderTasks() {
  const filter = $('#statusFilter').value;
  const search = $('#searchInput').value.trim().toLowerCase();
  const tasks = state.tasks.filter((t) => (!filter || t.status === filter) && (!search || `${t.title} ${t.description || ''}`.toLowerCase().includes(search)));
  $('#taskCount').textContent = `${tasks.length} task${tasks.length === 1 ? '' : 's'}`;
  $('#taskList').innerHTML = tasks.length ? tasks.map((t) => `<button class="task ${state.selected === t.id ? 'selected' : ''}" data-id="${t.id}"><span class="task-top"><strong>${escapeHtml(t.title)}</strong><span class="status ${t.status}">${t.status.replace('_', ' ')}</span></span><span class="task-meta">#${t.id} · ${t.due_date ? `due ${t.due_date}` : 'no due date'}</span></button>`).join('') : '<div class="empty">No matching tasks.</div>';
  document.querySelectorAll('.task').forEach((el) => el.addEventListener('click', () => selectTask(Number(el.dataset.id))));
}
function selectTask(id) {
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return;
  state.selected = id;
  $('#taskId').value = id;
  $('#title').value = task.title;
  $('#description').value = task.description || '';
  $('#status').value = task.status;
  $('#dueDate').value = task.due_date || '';
  renderTasks();
}
function clearForm() {
  state.selected = null;
  $('#taskId').value = '';
  $('#title').value = '';
  $('#description').value = '';
  $('#status').value = 'todo';
  $('#dueDate').value = '';
  renderTasks();
}
function payload() {
  const data = { title: $('#title').value, description: $('#description').value || null, status: $('#status').value, due_date: $('#dueDate').value || null };
  return data;
}
function validate(data, partial = false) {
  const errors = [];
  if ((!partial || data.title !== undefined) && (!data.title || !data.title.trim())) errors.push('title must not be blank');
  if (data.title && data.title.length > 200) errors.push('title must be at most 200 characters');
  if (data.description && data.description.length > 2000) errors.push('description must be at most 2000 characters');
  return errors;
}
function showResponse(status, body, method, path) {
  state.response = { status, body };
  $('#responseStatus').textContent = `${status} ${status < 300 ? 'OK' : 'ERROR'}`;
  $('#responseStatus').className = status < 300 ? 'response-ok' : 'response-error';
  $('#responseBody').textContent = JSON.stringify(body, null, 2);
  $('#requestLine').textContent = `${method} ${path}`;
  log(`${method} ${path} → ${status}`);
}
function demoRequest(method, path, body) {
  const parts = path.split('/').filter(Boolean);
  if (path === '/health') return [200, { status: 'ok' }];
  if (parts[0] !== 'tasks') return [404, { detail: 'Not Found' }];
  if (parts.length === 1 && method === 'GET') {
    const url = new URL(path, 'http://demo.local');
    const status = url.searchParams.get('status');
    const limit = Number(url.searchParams.get('limit') || 100);
    const offset = Number(url.searchParams.get('offset') || 0);
    if (status && !['todo', 'in_progress', 'done'].includes(status)) return [422, { detail: [{ msg: 'Input should be todo, in_progress or done' }] }];
    if (limit < 1 || limit > 100 || offset < 0) return [422, { detail: [{ msg: 'Invalid pagination values' }] }];
    const filtered = state.tasks.filter((t) => !status || t.status === status);
    return [200, clone(filtered.slice(offset, offset + limit))];
  }
  if (parts.length === 1 && method === 'POST') {
    const errors = validate(body);
    if (errors.length) return [422, { detail: errors.map((msg) => ({ msg })) }];
    const task = { ...body, title: body.title.trim(), id: state.nextId++, created_at: now(), updated_at: now() };
    state.tasks.push(task);
    return [201, clone(task)];
  }
  const id = Number(parts[1]);
  const task = state.tasks.find((t) => t.id === id);
  if (!task) return [404, { detail: 'Task not found' }];
  if (method === 'GET') return [200, clone(task)];
  if (method === 'DELETE') { state.tasks = state.tasks.filter((t) => t.id !== id); return [204, null]; }
  if (method === 'PUT' || method === 'PATCH') {
    const errors = validate(body, method === 'PATCH');
    if (errors.length) return [422, { detail: errors.map((msg) => ({ msg })) }];
    Object.assign(task, body);
    if (task.title) task.title = task.title.trim();
    task.updated_at = now();
    return [200, clone(task)];
  }
  return [405, { detail: 'Method Not Allowed' }];
}
async function request(method, path, body) {
  let status, result;
  if (state.mode === 'demo') {
    [status, result] = demoRequest(method, path, body);
  } else {
    try {
      const response = await fetch($('#baseUrl').value.replace(/\/$/, '') + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
      result = response.status === 204 ? null : await response.json();
      status = response.status;
    } catch (error) {
      status = 0; result = { detail: `Request failed: ${error.message}. Start the API and check CORS settings.` };
    }
  }
  showResponse(status, result, method, path);
  if (state.mode === 'demo') renderTasks();
  return { status, body: result };
}
function demoRequest(method, path, body) {
  const idMatch = path.match(/^\/tasks\/(\d+)$/);
  const index = idMatch ? demoTasks.findIndex(task => task.id === Number(idMatch[1])) : -1;
  if (method === 'GET' && path === '/health') return { status: 200, body: { status: 'ok' } };
  if (method === 'GET' && path.startsWith('/tasks?')) {
    const params = new URLSearchParams(path.split('?')[1]);
    const status = params.get('status');
    const limit = Number(params.get('limit') || 100);
    const offset = Number(params.get('offset') || 0);
    if (status && !['todo', 'in_progress', 'done'].includes(status)) return demoValidation('Invalid status');
    if (limit < 1 || limit > 100 || offset < 0) return demoValidation('Invalid pagination');
    const filtered = demoTasks.filter(task => !status || task.status === status);
    return { status: 200, body: filtered.slice(offset, offset + limit) };
  }
  if (method === 'GET' && path === '/tasks') return { status: 200, body: demoTasks };
  if (method === 'POST' && path === '/tasks') {
    const error = validateDemoTask(body, false);
    if (error) return error;
    const now = new Date().toISOString();
    const task = { id: demoNextId++, title: body.title.trim(), description: body.description || null,
      status: body.status || 'todo', due_date: body.due_date || null, created_at: now, updated_at: now };
    demoTasks.unshift(task);
    return { status: 201, body: task };
  }
  if (idMatch && index < 0) return { status: 404, body: { detail: 'Task not found' } };
  if (method === 'GET' && idMatch) return { status: 200, body: demoTasks[index] };
  if (method === 'DELETE' && idMatch) {
    demoTasks.splice(index, 1);
    return { status: 204, body: null };
  }
  if ((method === 'PUT' || method === 'PATCH') && idMatch) {
    const error = validateDemoTask(body, method === 'PATCH');
    if (error) return error;
    const task = demoTasks[index];
    Object.keys(body).forEach(key => { task[key] = key === 'title' ? body[key].trim() : body[key]; });
    task.updated_at = new Date().toISOString();
    return { status: 200, body: task };
  }
  return { status: 404, body: { detail: 'Demo route not found' } };
}

function validateDemoTask(body, partial) {
  if (!body || typeof body !== 'object') return demoValidation('JSON object required');
  if (!partial && (!body.title || !body.title.trim())) return demoValidation('title is required');
  if ('title' in body && (!body.title || !body.title.trim() || body.title.length > 200)) {
    return demoValidation('title must contain 1–200 non-whitespace characters');
  }
  if (body.description && body.description.length > 2000) return demoValidation('description is too long');
  if (body.status && !['todo', 'in_progress', 'done'].includes(body.status)) return demoValidation('Invalid status');
  return null;
}

function demoValidation(message) {
  return { status: 422, body: { detail: [{ msg: message, type: 'demo_validation' }] } };
}

document.querySelectorAll('.endpoint').forEach(button => {
  button.addEventListener('click', () => {
    const route = button.dataset.endpoint.split(' ');
    method.value = route[0];
    path.value = route[1];
    body.value = button.dataset.body || '';
    document.querySelectorAll('.endpoint').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    path.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});

document.querySelectorAll('input[name="mode"]').forEach(input => {
  input.addEventListener('change', () => {
    mode = input.value;
    modeHelp.textContent = mode === 'demo'
      ? 'Demo mode uses isolated sample data in this page. No API server or database is used.'
      : 'Live mode sends real HTTP requests to the configured FastAPI server. CORS must allow this page.';
    responseMeta.textContent = 'Mode changed';
    responseBody.textContent = mode === 'demo' ? 'Ready — demo data is isolated.' : 'Ready — live requests will change API data.';
    responseBody.className = '';
  });
});

sendButton.addEventListener('click', sendRequest);
copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(responseBody.textContent);
    copyButton.textContent = 'Copied';
    setTimeout(() => { copyButton.textContent = 'Copy'; }, 1200);
  } catch {
    copyButton.textContent = 'Select manually';
  }
});
