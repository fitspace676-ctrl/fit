import type * as UrlModule from './zkbio-url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./zkbio-url', async (importOriginal) => ({
  ...(await importOriginal<typeof UrlModule>()),
  assertPublicHost: vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
}));
import { ZkbioClient } from './zkbio-client';
import { assertPublicHost } from './zkbio-url';
import { ZkbioApiError } from './zkbio-errors';

const connection = { baseUrl: 'https://gym.example/api/', apiToken: 'secret+/token' };
const fetchMock = vi.fn<typeof fetch>();
const client = new ZkbioClient({ fetch: fetchMock });
const p = { pageNo: 2, pageSize: 1000 };
const person = {
  pin: '123',
  name: 'Name',
  lastName: 'Last',
  gender: 'F' as const,
  cardNo: '',
  mobilePhone: '555',
  email: 'a@b.test',
  deptCode: '1',
  personPhoto: 'base64',
  isDisabled: false,
  accLevelIds: 'a,b',
  personPwd: 'pwd',
};
const department = { name: 'Gym', code: '1', parentCode: '0' };
const card = { pin: '123', cardNo: '456', cardType: '0' as const };
const instant = new Date('2026-11-20T08:00:00Z');
const dates = { startDate: instant, endDate: instant, utcOffsetMinutes: 240 };
const dateQuery = { ...p, startDate: '2026-11-20 12:00:00', endDate: '2026-11-20 12:00:00' };
const event = { pin: '123', eventTime: '2026-11-20 12:00:00' };
const eventPage = { page: 1, size: 1, total: 1, data: [event] };
function reply(data: unknown = null, code = 0) {
  return new Response(JSON.stringify({ code, message: 'success', data }));
}
beforeEach(() => {
  fetchMock.mockReset();
  vi.mocked(assertPublicHost)
    .mockReset()
    .mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
});
afterEach(() => {
  vi.useRealTimers();
});

type Contract = [
  string,
  () => Promise<unknown>,
  string,
  string,
  Record<string, string | number>,
  unknown?,
  unknown?,
];
// Independent fixtures transcribed from each manual request URL/content table.
const contracts: Contract[] = [
  [
    'upsertPerson §2.1.1.1',
    () => client.upsertPerson(connection, person, 240),
    'POST',
    '/api/person/add',
    {},
    person,
  ],
  [
    'upsertPersons §2.1.1.14',
    () => client.upsertPersons(connection, [person], 240),
    'POST',
    '/api/v2/person/addPersons',
    {},
    [person],
  ],
  [
    'getPerson §2.1.1.5',
    () => client.getPerson(connection, '123', 240),
    'GET',
    '/api/person/get',
    { pin: '123' },
    undefined,
    person,
  ],
  [
    'listPersons §2.1.1.12',
    () => client.listPersons(connection, { ...p, pins: ['1', '2'], deptCodes: ['3', '4'] }, 240),
    'POST',
    '/api/v2/person/getPersonList',
    {},
    { ...p, pins: '1,2', deptCodes: '3,4' },
    { page: 0, size: 1, total: 1, data: [person] },
  ],
  [
    'deletePerson §2.1.1.3',
    () => client.deletePerson(connection, '123'),
    'POST',
    '/api/person/delete',
    { pin: '123' },
  ],
  [
    'deletePersons §2.1.1.15',
    () => client.deletePersons(connection, ['1', '2']),
    'POST',
    '/api/v2/person/deleteByPins',
    { pins: '1,2' },
  ],
  [
    'enablePersons §2.1.1.17',
    () => client.enablePersons(connection, ['1', '2']),
    'POST',
    '/api/person/enabledByPins',
    { pins: '1,2' },
  ],
  [
    'disablePersons §2.1.1.18',
    () => client.disablePersons(connection, ['1', '2']),
    'POST',
    '/api/person/disableByPins',
    { pins: '1,2' },
  ],
  [
    'updatePersonPhoto §2.1.1.11',
    () => client.updatePersonPhoto(connection, '123', 'base64'),
    'POST',
    '/api/person/updatePersonnelPhoto',
    {},
    { pin: '123', personPhoto: 'base64' },
  ],
  [
    'resignPerson §2.1.1.9',
    () => client.resignPerson(connection, { pin: '123', leaveDate: '2026-11-20', leaveType: '1' }),
    'POST',
    '/api/person/leave',
    {},
    { pin: '123', leaveDate: '2026-11-20', leaveType: '1' },
  ],
  [
    'reinstatePerson §2.1.1.13',
    () => client.reinstatePerson(connection, person, 240),
    'POST',
    '/api/person/reinstated',
    {},
    person,
  ],
  [
    'getDynamicQrCode §2.1.1.7',
    () => client.getDynamicQrCode(connection, 'a/b'),
    'POST',
    '/api/person/getQrCode/a%2Fb',
    {},
    { pin: 'a/b' },
    'qr',
  ],
  [
    'getDynamicQrCodeV2 §2.1.1.8',
    () => client.getDynamicQrCodeV2(connection, '123'),
    'POST',
    '/api/v2/person/getQrCode',
    { pin: '123' },
    { pin: '123' },
    'qr',
  ],
  [
    'detectFace §2.1.1.16',
    () => client.detectFace(connection, 'base64'),
    'POST',
    '/api/v2/person/detectFace',
    {},
    { personPhoto: 'base64' },
  ],
  [
    'upsertDepartment §2.1.2.1',
    () => client.upsertDepartment(connection, department),
    'POST',
    '/api/department/add',
    {},
    department,
  ],
  [
    'getDepartment §2.1.2.5',
    () => client.getDepartment(connection, '1'),
    'GET',
    '/api/department/get',
    { code: '1' },
  ],
  [
    'listDepartments §2.1.2.6',
    () => client.listDepartments(connection, p),
    'POST',
    '/api/department/getDepartmentList',
    p,
  ],
  [
    'deleteDepartment §2.1.2.3',
    () => client.deleteDepartment(connection, '1'),
    'POST',
    '/api/department/delete',
    { code: '1' },
  ],
  [
    'getCards §2.1.3.2',
    () => client.getCards(connection, '123'),
    'GET',
    '/api/card/getCards',
    { pin: '123' },
  ],
  ['setCard §2.1.3.3', () => client.setCard(connection, card), 'POST', '/api/card/set', {}, card],
  [
    'getBioTemplates §2.1.4.5',
    () => client.getBioTemplates(connection, '123'),
    'GET',
    '/api/v2/bioTemplate/getFgListByPin',
    { pin: '123' },
  ],
  [
    'deleteBioTemplates §2.1.4.6',
    () => client.deleteBioTemplates(connection, '123'),
    'POST',
    '/api/v2/bioTemplate/deleteByPin',
    { pin: '123' },
  ],
  [
    'listAccessDevices §2.2.1.3',
    () => client.listAccessDevices(connection, p),
    'GET',
    '/api/device/accList',
    p,
  ],
  [
    'getAccessDevice §2.2.1.2',
    () => client.getAccessDevice(connection, 'sn'),
    'GET',
    '/api/device/getAcc',
    { sn: 'sn' },
  ],
  ['listDoors §2.2.2.10', () => client.listDoors(connection, p), 'GET', '/api/v2/door/list', p],
  [
    'getAllDoorStates §2.2.2.1',
    () => client.getAllDoorStates(connection, 123),
    'GET',
    '/api/door/allDoorState',
    { timestamp: 123 },
  ],
  [
    'getDoorState §2.2.2.2',
    () => client.getDoorState(connection, 'd', 123),
    'GET',
    '/api/door/doorStateById',
    { doorId: 'd', timestamp: 123 },
  ],
  [
    'getDoorStatesBySn §2.2.2.3',
    () => client.getDoorStatesBySn(connection, 'sn', 123),
    'GET',
    '/api/door/doorStateBySn',
    { deviceSn: 'sn', timestamp: 123 },
  ],
  [
    'openDoor §2.2.2.8',
    () => client.openDoor(connection, 'd', 254),
    'POST',
    '/api/door/remoteOpenById',
    { doorId: 'd', interval: 254 },
  ],
  [
    'closeDoor §2.2.2.6',
    () => client.closeDoor(connection, 'd'),
    'POST',
    '/api/door/remoteCloseById',
    { doorId: 'd' },
  ],
  [
    'lockDoor §2.2.2.11',
    () => client.lockDoor(connection, 'd'),
    'POST',
    '/api/door/remoteLockById',
    { doorId: 'd' },
  ],
  [
    'unlockDoor §2.2.2.13',
    () => client.unlockDoor(connection, 'd'),
    'POST',
    '/api/door/remoteUnlockById',
    { doorId: 'd' },
  ],
  [
    'listAccessReaders §2.2.3.3',
    () => client.listAccessReaders(connection, p),
    'GET',
    '/api/v2/reader/list',
    p,
  ],
  [
    'listAccessLevels §2.2.4.10',
    () => client.listAccessLevels(connection, p),
    'GET',
    '/api/v2/accLevel/list',
    p,
  ],
  [
    'getAccessLevel §2.2.4.3',
    () => client.getAccessLevel(connection, 'l'),
    'GET',
    '/api/v2/accLevel/getById',
    { id: 'l' },
  ],
  [
    'getAccessLevelByName §2.2.4.5',
    () => client.getAccessLevelByName(connection, 'Level'),
    'GET',
    '/api/v2/accLevel/getByName',
    { name: 'Level' },
  ],
  [
    'upsertAccessLevels §2.2.4.11',
    () =>
      client.upsertAccessLevels(connection, [
        { name: 'Level', areaName: 'Area', timeSegName: 'Time' },
      ]),
    'POST',
    '/api/accLevel/addLevel',
    {},
    [{ name: 'Level', areaName: 'Area', timeSegName: 'Time' }],
  ],
  [
    'upsertAccessLevelDoors §2.2.4.12',
    () => client.upsertAccessLevelDoors(connection, [{ levelName: 'Level', doorName: 'Door' }]),
    'POST',
    '/api/accLevel/addLevelDoor',
    {},
    [{ levelName: 'Level', doorName: 'Door' }],
  ],
  [
    'assignAccessLevels §2.2.4.13',
    () => client.assignAccessLevels(connection, '123', ['a', 'b']),
    'POST',
    '/api/accLevel/addLevelPerson',
    { pin: '123', levelIds: 'a,b' },
  ],
  [
    'deletePersonAccessLevels §2.2.4.1',
    () => client.deletePersonAccessLevels(connection, '123', ['a', 'b']),
    'POST',
    '/api/accLevel/deleteLevel',
    { pin: '123', levelIds: 'a,b' },
  ],
  [
    'syncAccessPerson §2.2.4.9',
    () => client.syncAccessPerson(connection, '123', ['a', 'b']),
    'POST',
    '/api/accLevel/syncPerson',
    { pin: '123', levelIds: 'a,b' },
  ],
  [
    'syncAccessLevel §2.2.4.8',
    () => client.syncAccessLevel(connection, 'l'),
    'POST',
    '/api/accLevel/syncLevel',
    { levelId: 'l' },
  ],
  [
    'getWhoIsInside §2.2.6.1',
    () => client.getWhoIsInside(connection, '1'),
    'GET',
    '/api/accAdvanced/getWhoIsInsideByZone',
    { code: '1' },
  ],
  [
    'listAuxiliaryInputs §2.2.7.1',
    () => client.listAuxiliaryInputs(connection, p),
    'GET',
    '/api/accAuxIn/list',
    p,
  ],
  [
    'listAuxiliaryOutputs §2.2.8.1',
    () => client.listAuxiliaryOutputs(connection, p),
    'GET',
    '/api/accAuxOut/list',
    p,
  ],
  [
    'listEntranceDevices §2.9.1.3',
    () => client.listEntranceDevices(connection, p),
    'GET',
    '/api/v2/psgDevice/list',
    p,
  ],
  [
    'getEntranceDevice §2.9.1.2',
    () => client.getEntranceDevice(connection, 'sn'),
    'GET',
    '/api/psgDevice/getBySn',
    { sn: 'sn' },
  ],
  ['listGates §2.9.2.6', () => client.listGates(connection, p), 'GET', '/api/v2/psgGate/list', p],
  [
    'getAllGateStates §2.9.2.1',
    () => client.getAllGateStates(connection),
    'GET',
    '/api/psgGate/allGateState',
    {},
  ],
  [
    'getGateState §2.9.2.2',
    () => client.getGateState(connection, 'g'),
    'GET',
    '/api/psgGate/gateStateById',
    { gateId: 'g' },
  ],
  [
    'getGateStatesBySn §2.9.2.3',
    () => client.getGateStatesBySn(connection, 'sn'),
    'GET',
    '/api/psgGate/gateStateBySn',
    { deviceSn: 'sn' },
  ],
  [
    'openGate §2.9.2.7',
    () => client.openGate(connection, 'g', 1),
    'POST',
    '/api/psgGate/remoteOpenById',
    { gateId: 'g', openType: 1 },
  ],
  [
    'openGateByName §2.9.2.8',
    () => client.openGateByName(connection, 'Gate', 2),
    'POST',
    '/api/psgGate/remoteOpenByName',
    { gateName: 'Gate', openType: 2 },
  ],
  [
    'listEntranceLevels §2.9.3.9',
    () => client.listEntranceLevels(connection, p),
    'GET',
    '/api/v2/psgLevel/list',
    p,
  ],
  [
    'getEntranceLevel §2.9.3.4',
    () => client.getEntranceLevel(connection, 'l'),
    'GET',
    '/api/v2/psgLevel/getById/l',
    {},
  ],
  [
    'getEntranceLevelByName §2.9.3.5',
    () => client.getEntranceLevelByName(connection, 'A/B'),
    'GET',
    '/api/v2/psgLevel/getByName/A%2FB',
    {},
  ],
  [
    'addEntranceLevelByLevel §2.9.3.10',
    () => client.addEntranceLevelByLevel(connection, [{ levelId: 'l', pins: ['1', '2'] }]),
    'POST',
    '/api/v2/psgLevel/addLevelByLevel',
    {},
    [{ levelId: 'l', pins: ['1', '2'] }],
  ],
  [
    'addEntranceLevelByPerson §2.9.3.11',
    () => client.addEntranceLevelByPerson(connection, [{ pin: '1', levelIds: ['a', 'b'] }]),
    'POST',
    '/api/v2/psgLevel/addLevelByPerson',
    {},
    [{ pin: '1', levelIds: ['a', 'b'] }],
  ],
  [
    'deletePersonEntranceLevels §2.9.3.1',
    () => client.deletePersonEntranceLevels(connection, '1', ['a', 'b']),
    'POST',
    '/api/psgLevel/deleteLevel',
    { pin: '1', levelIds: 'a,b' },
  ],
  [
    'syncEntrancePerson §2.9.3.8',
    () => client.syncEntrancePerson(connection, '1', ['a', 'b']),
    'POST',
    '/api/psgLevel/syncPerson',
    { pin: '1', levelIds: 'a,b' },
  ],
  [
    'syncEntranceLevel §2.9.3.7',
    () => client.syncEntranceLevel(connection, 'l'),
    'POST',
    '/api/psgLevel/syncLevel',
    { levelId: 'l' },
  ],
  [
    'listEntranceReaders §2.9.4.2',
    () => client.listEntranceReaders(connection, p),
    'GET',
    '/api/v2/psgReader/list',
    p,
  ],
  [
    'upsertArea §2.15.1.1',
    () => client.upsertArea(connection, department),
    'POST',
    '/api/area/add',
    {},
    department,
  ],
  [
    'getArea §2.15.1.3',
    () => client.getArea(connection, '1'),
    'GET',
    '/api/area/get',
    { code: '1' },
  ],
  [
    'deleteArea §2.15.1.2',
    () => client.deleteArea(connection, '1'),
    'POST',
    '/api/area/delete',
    { code: '1' },
  ],
  [
    'listAreas §2.15.1.4',
    () => client.listAreas(connection, p),
    'POST',
    '/api/area/getAreaList',
    p,
  ],
  [
    'listAccessTransactions §2.2.5.5',
    () => client.listAccessTransactions(connection, { ...p, ...dates, personPin: '123' }),
    'GET',
    '/api/v2/transaction/list',
    { ...dateQuery, personPin: '123' },
    undefined,
    eventPage,
  ],
  [
    'getAccessTransactionsBySn §2.2.5.3',
    () => client.getAccessTransactionsBySn(connection, 'sn', { ...p, ...dates }),
    'GET',
    '/api/v3/transaction/device',
    { ...dateQuery, deviceSn: 'sn' },
    undefined,
    eventPage,
  ],
  [
    'getAccessTransactionsByPin §2.2.5.9',
    () => client.getAccessTransactionsByPin(connection, '123', { ...p, ...dates }),
    'GET',
    '/api/v3/transaction/person',
    { ...dateQuery, pin: '123' },
    undefined,
    eventPage,
  ],
  [
    'listEntranceTransactions §2.9.5.5',
    () => client.listEntranceTransactions(connection, { ...p, ...dates }),
    'GET',
    '/api/v2/psgTransaction/list',
    dateQuery,
    undefined,
    eventPage,
  ],
  [
    'getEntranceTransactionsBySn §2.9.5.3',
    () => client.getEntranceTransactionsBySn(connection, 'a/b', { ...p, ...dates }),
    'GET',
    '/api/v3/psgTransaction/device/a%2Fb',
    dateQuery,
    undefined,
    eventPage,
  ],
  [
    'getEntranceTransactionsByPin §2.9.5.9',
    () => client.getEntranceTransactionsByPin(connection, '123', { ...p, ...dates }),
    'GET',
    '/api/v3/psgTransaction/person/123',
    dateQuery,
    undefined,
    eventPage,
  ],
  [
    'monitorAccessTransactions §2.2.5.6',
    () => client.monitorAccessTransactions(connection, 123, 240),
    'GET',
    '/api/transaction/monitor',
    { timestamp: 123 },
    undefined,
    [event],
  ],
  [
    'monitorEntranceTransactions §2.9.5.6',
    () => client.monitorEntranceTransactions(connection, 123, 240),
    'GET',
    '/api/psgTransaction/monitor',
    { timestamp: 123 },
    undefined,
    [event],
  ],
  [
    'getAccessTransaction §2.2.5.17',
    () => client.getAccessTransaction(connection, 'e', 240),
    'GET',
    '/api/v2/transaction/getById',
    { id: 'e' },
    undefined,
    event,
  ],
  [
    'getFirstInLastOut §2.2.5.12',
    () => client.getFirstInLastOut(connection, '123', { ...p, ...dates }),
    'GET',
    '/api/v2/transaction/firstInAndLastOut',
    { ...dateQuery, pin: '123' },
    undefined,
    {
      ...eventPage,
      data: [{ id: 'e', pin: '123', firstInTime: event.eventTime, lastOutTime: null }],
    },
  ],
];

describe('manual request contracts', () => {
  it.each(contracts)('%s', async (_name, invoke, method, path, query, body, responseData) => {
    fetchMock.mockResolvedValue(reply(responseData));
    await invoke();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [rawUrl, init] = fetchMock.mock.calls[0]!;
    const url = new URL(rawUrl as string);
    expect(url.origin).toBe('https://gym.example');
    expect(url.pathname).toBe(path);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])),
      access_token: connection.apiToken,
    });
    expect(init!.method).toBe(method);
    expect(init!.body).toBe(body === undefined ? undefined : JSON.stringify(body));
    expect(init!.redirect).toBe('manual');
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(assertPublicHost).toHaveBeenCalledWith('https://gym.example');
  });
  it.each(contracts)('%s propagates typed vendor errors', async (_name, invoke) => {
    fetchMock.mockResolvedValue(reply(null, -22));
    await expect(invoke()).rejects.toMatchObject({ code: -22, reason: 'person_not_found' });
  });
});

describe('transport and higher-level contracts', () => {
  it('probes page 1 size 1 and supports both documented device result shapes', async () => {
    for (const data of [[], { page: 0, size: 1, total: 0, data: [] }]) {
      fetchMock.mockResolvedValue(reply(data));
      await expect(client.checkConnection(connection)).resolves.toEqual({ ok: true });
    }
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/api/device/accList');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      pageNo: '1',
      pageSize: '1',
      access_token: connection.apiToken,
    });
    expect(fetchMock.mock.calls[0]![1]!.method).toBe('GET');
    expect(fetchMock.mock.calls[0]![1]!.body).toBeUndefined();
  });
  it.each([401, 403])('maps HTTP %i to unauthorized', async (status) => {
    fetchMock.mockResolvedValue(new Response('', { status }));
    await expect(client.checkConnection(connection)).resolves.toEqual({
      ok: false,
      reason: 'unauthorized',
    });
  });
  it.each([301, 302, 303, 307, 308, 500])('does not follow HTTP %i or retry', async (status) => {
    fetchMock.mockResolvedValue(
      new Response('', { status, headers: { Location: 'http://169.254.169.254' } }),
    );
    await expect(client.checkConnection(connection)).resolves.toEqual({
      ok: false,
      reason: 'unreachable',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![1]!.redirect).toBe('manual');
  });
  it.each([
    'html',
    '{}',
    '{"code":0,"message":"success"}',
    '{"code":"0","message":"success","data":[]}',
    '{"code":0,"message":"success","data":null}',
  ])('rejects non-ZKBio probe response %s', async (body) => {
    fetchMock.mockResolvedValue(new Response(body));
    await expect(client.checkConnection(connection)).resolves.toEqual({
      ok: false,
      reason: 'not_zkbio',
    });
  });
  it('never emits a token from network errors or vendor messages', async () => {
    fetchMock.mockRejectedValue(new Error(`failed ${connection.apiToken}`));
    await expect(client.openDoor(connection, 'd', 1)).rejects.toThrow(
      'ZKBio transport failed (unreachable)',
    );
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: -23, message: connection.apiToken, data: null })),
    );
    try {
      await client.openDoor(connection, 'd', 1);
    } catch (error) {
      expect(error).toBeInstanceOf(ZkbioApiError);
      expect(String(error)).not.toContain(connection.apiToken);
      expect(JSON.stringify(error)).not.toContain(connection.apiToken);
    }
  });
  it('aborts fetch at 10 seconds even if the injected fetch ignores AbortSignal', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const result = expect(client.getPerson(connection, '123', 240)).rejects.toMatchObject({
      reason: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(10000);
    await result;
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });
  it('bounds DNS time and never sends a request after timeout', async () => {
    vi.useFakeTimers();
    let finish!: (addresses: { address: string; family: number }[]) => void;
    vi.mocked(assertPublicHost).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const result = expect(client.getPerson(connection, '123', 240)).rejects.toMatchObject({
      reason: 'timeout',
    });
    await vi.advanceTimersByTimeAsync(10000);
    await result;
    finish([{ address: '8.8.8.8', family: 4 }]);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('revalidates DNS and isolates connection tokens on every call', async () => {
    // Response bodies are single-use, just like real fetch responses.
    fetchMock.mockImplementation(() => Promise.resolve(reply(person)));
    await client.getPerson(connection, '123', 240);
    await client.getPerson({ baseUrl: 'https://other.example', apiToken: 'other' }, '123', 240);
    expect(assertPublicHost).toHaveBeenCalledTimes(2);
    expect(new URL(fetchMock.mock.calls[1]![0] as string).searchParams.get('access_token')).toBe(
      'other',
    );
    vi.mocked(assertPublicHost).mockRejectedValue(new Error('private host'));
    await expect(client.getPerson(connection, '123', 240)).rejects.toMatchObject({
      reason: 'unreachable',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('gets bound levels from the full person list without inventing an endpoint', async () => {
    fetchMock.mockResolvedValue(
      reply({ page: 0, size: 1, total: 1, data: [{ pin: '123', accLevelIds: 'a,b' }] }),
    );
    await expect(client.getPersonAccessLevelIds(connection, '123', 240)).resolves.toEqual([
      'a',
      'b',
    ]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(new URL(url as string).pathname).toBe('/api/v2/person/getPersonList');
    expect(init!.method).toBe('POST');
    expect(JSON.parse(init!.body as string)).toEqual({ pins: '123', pageNo: 1, pageSize: 1 });
    fetchMock.mockResolvedValue(reply({ data: [] }));
    await expect(client.getPersonAccessLevelIds(connection, '123', 240)).rejects.toMatchObject({
      reason: 'person_not_found',
    });
  });
  it('formats person validity and parses event and first-in/out dates with +04:00', async () => {
    fetchMock.mockResolvedValue(reply());
    await client.upsertPerson(
      connection,
      { pin: '123', accStartTime: instant, accEndTime: instant },
      240,
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      pin: '123',
      accStartTime: event.eventTime,
      accEndTime: event.eventTime,
    });
    fetchMock.mockResolvedValue(
      reply({ ...person, accStartTime: event.eventTime, accEndTime: null }),
    );
    const parsedPerson = await client.getPerson(connection, '123', 240);
    expect(parsedPerson.accStartTime).toEqual(instant);
    expect(parsedPerson.accEndTime).toBeNull();
    fetchMock.mockResolvedValue(reply(eventPage));
    expect(
      (await client.listAccessTransactions(connection, { ...p, ...dates })).data[0]!.eventTime,
    ).toEqual(instant);
    fetchMock.mockResolvedValue(
      reply({
        ...eventPage,
        data: [{ pin: '123', firstInTime: event.eventTime, lastOutTime: null }],
      }),
    );
    const first = await client.getFirstInLastOut(connection, '123', { ...p, ...dates });
    expect(first.data[0]!.firstInTime).toEqual(instant);
    expect(first.data[0]!.lastOutTime).toBeNull();
  });
  it.each([0, -1, 255, 1.5, NaN])('rejects invalid door duration %s', async (interval) => {
    await expect(client.openDoor(connection, 'd', interval)).rejects.toThrow(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { pageNo: 0, pageSize: 1 },
    { pageNo: 1, pageSize: 1001 },
    { pageNo: 1, pageSize: 0 },
    { pageNo: 1.5, pageSize: 1 },
  ])('rejects invalid pagination %j', async (input) => {
    await expect(client.listDoors(connection, input)).rejects.toThrow(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
