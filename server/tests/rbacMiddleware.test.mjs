// Система: права доступа в проекте (middleware/rbacMiddleware.js), БД подменена
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mockServerModule, run } from './helpers/http.mjs';

const state = { perms: [], task: null, canSee: true, rows: [] };
mockServerModule('config/db.js', { pool: { query: async () => ({ rows: state.rows }) } });
mockServerModule('db/RoleRepository.js', {
  RoleRepository: { getUserPermissionsInProject: async () => state.perms },
});
mockServerModule('db/StorageRepository.js', { StorageRepository: { canSee: async () => state.canSee } });
mockServerModule('db/TaskRepository.js', { TaskRepository: { findById: async () => state.task } });
mockServerModule('db/TaskVisibilityRepository.js', {
  TaskVisibilityRepository: { canSee: async () => state.canSee },
});
const rbac = await import('../middleware/rbacMiddleware.js');

beforeEach(() => Object.assign(state, { perms: [], task: null, canSee: true, rows: [] }));
const req = (extra = {}) => ({ user: { id: 5 }, params: {}, body: {}, ...extra });

test('checkProjectAccess: не число в projectId → 400', async () => {
  const { res, nextCalled } = await run(rbac.checkProjectAccess('READ'), req({ params: { projectId: 'abc' } }));
  assert.equal(res.statusCode, 400);
  assert.equal(nextCalled, false);
});

test('checkProjectAccess: не участник проекта → 403 «Нет доступа»', async () => {
  const { res } = await run(rbac.checkProjectAccess('READ'), req({ params: { projectId: '1' } }));
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /Нет доступа/);
});

test('checkProjectAccess: нужного права нет → 403 с названием права', async () => {
  state.perms = ['READ'];
  const { res } = await run(rbac.checkProjectAccess('WRITE'), req({ params: { projectId: '1' } }));
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /WRITE/);
});

test('checkProjectAccess: право есть → next(), права и projectId в req', async () => {
  state.perms = ['READ', 'WRITE'];
  const r = req({ params: { projectId: '3' } });
  const { nextCalled } = await run(rbac.checkProjectAccess('WRITE'), r);
  assert.equal(nextCalled, true);
  assert.equal(r.projectId, 3);
  assert.deepEqual(r.userPermissions, ['READ', 'WRITE']);
});

test('ADMIN проходит любую проверку', async () => {
  state.perms = ['ADMIN'];
  const { nextCalled } = await run(rbac.checkProjectAccess('EXECUTE'), req({ params: { projectId: '1' } }));
  assert.equal(nextCalled, true);
});

test('checkProjectAccess берёт projectId из body, если его нет в URL', async () => {
  state.perms = ['READ'];
  const { nextCalled } = await run(rbac.checkProjectAccess('READ'), req({ body: { projectId: 9 } }));
  assert.equal(nextCalled, true);
});

test('checkTaskAccess: задачи нет → 404', async () => {
  const { res } = await run(rbac.checkTaskAccess('READ'), req({ params: { taskId: '1' } }));
  assert.equal(res.statusCode, 404);
});

test('checkTaskAccess: задача скрыта от ролей пользователя → 404', async () => {
  state.task = { id: 1, project_id: 2 };
  state.perms = ['READ'];
  state.canSee = false;
  const { res, nextCalled } = await run(rbac.checkTaskAccess('READ'), req({ params: { taskId: '1' } }));
  assert.equal(res.statusCode, 404);
  assert.equal(nextCalled, false);
});

test('checkTaskAccess: скрытую задачу видит ADMIN проекта', async () => {
  state.task = { id: 1, project_id: 2 };
  state.perms = ['ADMIN'];
  state.canSee = false;
  const { nextCalled } = await run(rbac.checkTaskAccess('READ'), req({ params: { taskId: '1' } }));
  assert.equal(nextCalled, true);
});

test('checkRoleAccess: роли нет → 404; верный id и права → next()', async () => {
  const bad = await run(rbac.checkRoleAccess('ADMIN'), req({ params: { roleId: '7' } }));
  assert.equal(bad.res.statusCode, 404);

  state.rows = [{ project_id: 4 }];
  state.perms = ['ADMIN'];
  const ok = await run(rbac.checkRoleAccess('ADMIN'), req({ params: { roleId: '7' } }));
  assert.equal(ok.nextCalled, true);
});

test('checkCardAccess: карточка на скрытой доске → 404 для обычного участника', async () => {
  state.rows = [{ project_id: 4, task_id: 11 }];
  state.perms = ['READ'];
  state.canSee = false;
  const { res } = await run(rbac.checkCardAccess('READ'), req({ params: { cardId: '3' } }));
  assert.equal(res.statusCode, 404);
});

test('checkKanbanTagAccess: некорректный id → 400', async () => {
  const { res } = await run(rbac.checkKanbanTagAccess('WRITE'), req({ params: { tagId: 'x' } }));
  assert.equal(res.statusCode, 400);
});
