import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { ZkbioApiError, ZkbioTransportError } from './zkbio-errors';
import { assertPublicHost, normalizeBaseUrl, type VettedAddress } from './zkbio-url';
import { formatZkbioDate, parseZkbioDate } from './zkbio-types';
import type {
  ZkbioConnection,
  Pagination,
  TimeRange,
  TransactionQuery,
  Page,
  PersonInput,
  Person,
  Department,
  Area,
  AreaInput,
  Card,
  BioTemplate,
  Device,
  Door,
  DoorState,
  GateState,
  Reader,
  Level,
  LevelInput,
  LevelDoorInput,
  LevelPersons,
  PersonLevels,
  Transaction,
  FirstInLastOut,
  Occupant,
  Auxiliary,
  ConnectionCheck,
} from './zkbio-types';

type Query = Record<string, string | number | undefined>;
/**
 * Stateless multi-gym client. Manual v1.3, July 2026; sections are on each method.
 * No retries: remote opening and other writes must never be replayed automatically.
 * Default transport pins vetted DNS answers; injected fetch is a trusted testing seam.
 * Ambiguities: access_token wins over acc_token. §2.2.1.3 uses device/accList in its
 * URL despite a v2/device/list heading, and may return an array or a page.
 * BioTemplate and door-by-SN examples show objects although described as lists.
 * QR v1/v2 repeat pin in the URL and JSON; both are sent. Area add sends parentCode
 * from the JSON example (description calls it parentAreaCode). V3 entrance paths
 * retain path parameters, unlike V3 access paths. First-in/out “V3” uses /v2/.
 * Monitor timestamps stay caller-owned; poll no more often than every 10 seconds.
 * Availability is governed by the server license/version, not device model alone.
 */
export class ZkbioClient {
  constructor(private readonly options: { fetch?: typeof fetch } = {}) {}

  /** §2.2.1.3: cheap authenticated read. HTTP 401/403 are unauthorized;
   * appendix -40 is access assignment failure, NOT an invalid token code. */
  async checkConnection(connection: ZkbioConnection): Promise<ConnectionCheck> {
    try {
      const devices = await this.listAccessDevices(connection, { pageNo: 1, pageSize: 1 });
      if (!Array.isArray(devices) && (!isRecord(devices) || !Array.isArray(devices.data))) {
        return { ok: false, reason: 'not_zkbio' };
      }
      return { ok: true };
    } catch (error) {
      if (error instanceof ZkbioTransportError && error.reason === 'unauthorized')
        return { ok: false, reason: 'unauthorized' };
      if (error instanceof ZkbioTransportError && error.reason === 'not_zkbio')
        return { ok: false, reason: 'not_zkbio' };
      return { ok: false, reason: 'unreachable' };
    }
  }

  /** §2.1.1.1. */
  async upsertPerson(
    connection: ZkbioConnection,
    input: PersonInput,
    utcOffsetMinutes: number,
  ): Promise<unknown> {
    return this.request(
      connection,
      '/api/person/add',
      'POST',
      {},
      personBody(input, utcOffsetMinutes),
    );
  }

  /** §2.1.1.14. */
  async upsertPersons(
    connection: ZkbioConnection,
    input: PersonInput[],
    utcOffsetMinutes: number,
  ): Promise<unknown> {
    return this.request(
      connection,
      '/api/v2/person/addPersons',
      'POST',
      {},
      input.map((p) => personBody(p, utcOffsetMinutes)),
    );
  }

  /** §2.1.1.5. */
  async getPerson(connection: ZkbioConnection, pin: string): Promise<Person> {
    return this.request(connection, '/api/person/get', 'GET', { pin }, undefined);
  }

  /** §2.1.1.12. */
  async listPersons(
    connection: ZkbioConnection,
    input: Pagination & { pins?: string[]; deptCodes?: string[] },
  ): Promise<Page<Person>> {
    return this.request(
      connection,
      '/api/v2/person/getPersonList',
      'POST',
      {},
      { ...page(input), pins: input.pins?.join(','), deptCodes: input.deptCodes?.join(',') },
    );
  }

  /** §2.1.1.3. */
  async deletePerson(connection: ZkbioConnection, pin: string): Promise<unknown> {
    return this.request(connection, '/api/person/delete', 'POST', { pin }, undefined);
  }

  /** §2.1.1.15. */
  async deletePersons(connection: ZkbioConnection, pins: string[]): Promise<unknown> {
    return this.request(
      connection,
      '/api/v2/person/deleteByPins',
      'POST',
      { pins: pins.join(',') },
      undefined,
    );
  }

  /** §2.1.1.17. */
  async enablePersons(connection: ZkbioConnection, pins: string[]): Promise<unknown> {
    return this.request(
      connection,
      '/api/person/enabledByPins',
      'POST',
      { pins: pins.join(',') },
      undefined,
    );
  }

  /** §2.1.1.18. */
  async disablePersons(connection: ZkbioConnection, pins: string[]): Promise<unknown> {
    return this.request(
      connection,
      '/api/person/disableByPins',
      'POST',
      { pins: pins.join(',') },
      undefined,
    );
  }

  /** §2.1.1.11. */
  async updatePersonPhoto(
    connection: ZkbioConnection,
    pin: string,
    personPhoto: string,
  ): Promise<unknown> {
    return this.request(
      connection,
      '/api/person/updatePersonnelPhoto',
      'POST',
      {},
      { pin, personPhoto },
    );
  }

  /** §2.1.1.9. */
  async resignPerson(
    connection: ZkbioConnection,
    input: { pin: string; leaveDate: string; leaveType: string },
  ): Promise<unknown> {
    return this.request(connection, '/api/person/leave', 'POST', {}, input);
  }

  /** §2.1.1.13. */
  async reinstatePerson(
    connection: ZkbioConnection,
    input: PersonInput,
    utcOffsetMinutes: number,
  ): Promise<unknown> {
    return this.request(
      connection,
      '/api/person/reinstated',
      'POST',
      {},
      personBody(input, utcOffsetMinutes),
    );
  }

  /** §2.1.1.7. */
  async getDynamicQrCode(connection: ZkbioConnection, pin: string): Promise<string> {
    return this.request(connection, `/api/person/getQrCode/${segment(pin)}`, 'POST', {}, { pin });
  }

  /** §2.1.1.8. */
  async getDynamicQrCodeV2(connection: ZkbioConnection, pin: string): Promise<string> {
    return this.request(connection, '/api/v2/person/getQrCode', 'POST', { pin }, { pin });
  }

  /** §2.1.1.16. */
  async detectFace(connection: ZkbioConnection, personPhoto: string): Promise<unknown> {
    return this.request(connection, '/api/v2/person/detectFace', 'POST', {}, { personPhoto });
  }

  /** §2.1.2.1. */
  async upsertDepartment(connection: ZkbioConnection, input: Department): Promise<unknown> {
    return this.request(connection, '/api/department/add', 'POST', {}, input);
  }

  /** §2.1.2.5. */
  async getDepartment(connection: ZkbioConnection, code: string): Promise<Department> {
    return this.request(connection, '/api/department/get', 'GET', { code }, undefined);
  }

  /** §2.1.2.6. */
  async listDepartments(connection: ZkbioConnection, input: Pagination): Promise<Page<Department>> {
    return this.request(
      connection,
      '/api/department/getDepartmentList',
      'POST',
      page(input),
      undefined,
    );
  }

  /** §2.1.2.3. */
  async deleteDepartment(connection: ZkbioConnection, code: string): Promise<unknown> {
    return this.request(connection, '/api/department/delete', 'POST', { code }, undefined);
  }

  /** §2.1.3.2. */
  async getCards(connection: ZkbioConnection, pin: string): Promise<Card[]> {
    return this.request(connection, '/api/card/getCards', 'GET', { pin }, undefined);
  }

  /** §2.1.3.3. */
  async setCard(connection: ZkbioConnection, input: Card): Promise<unknown> {
    return this.request(connection, '/api/card/set', 'POST', {}, input);
  }

  /** §2.1.4.5. */
  async getBioTemplates(
    connection: ZkbioConnection,
    pin: string,
  ): Promise<BioTemplate | BioTemplate[]> {
    return this.request(
      connection,
      '/api/v2/bioTemplate/getFgListByPin',
      'GET',
      { pin },
      undefined,
    );
  }

  /** §2.1.4.6. */
  async deleteBioTemplates(connection: ZkbioConnection, pin: string): Promise<unknown> {
    return this.request(connection, '/api/v2/bioTemplate/deleteByPin', 'POST', { pin }, undefined);
  }

  /** §2.2.1.3. */
  async listAccessDevices(
    connection: ZkbioConnection,
    input: Pagination,
  ): Promise<Page<Device> | Device[]> {
    return this.request(connection, '/api/device/accList', 'GET', page(input), undefined);
  }

  /** §2.2.1.2. */
  async getAccessDevice(connection: ZkbioConnection, sn: string): Promise<Device> {
    return this.request(connection, '/api/device/getAcc', 'GET', { sn }, undefined);
  }

  /** §2.2.2.10. */
  async listDoors(connection: ZkbioConnection, input: Pagination): Promise<Page<Door>> {
    return this.request(connection, '/api/v2/door/list', 'GET', page(input), undefined);
  }

  /** §2.2.2.1. */
  async getAllDoorStates(connection: ZkbioConnection, timestamp: number): Promise<DoorState[]> {
    return this.request(connection, '/api/door/allDoorState', 'GET', { timestamp }, undefined);
  }

  /** §2.2.2.2. */
  async getDoorState(
    connection: ZkbioConnection,
    doorId: string,
    timestamp: number,
  ): Promise<DoorState> {
    return this.request(
      connection,
      '/api/door/doorStateById',
      'GET',
      { doorId, timestamp },
      undefined,
    );
  }

  /** §2.2.2.3. */
  async getDoorStatesBySn(
    connection: ZkbioConnection,
    deviceSn: string,
    timestamp: number,
  ): Promise<DoorState | DoorState[]> {
    return this.request(
      connection,
      '/api/door/doorStateBySn',
      'GET',
      { deviceSn, timestamp },
      undefined,
    );
  }

  /** §2.2.2.8. */
  async openDoor(connection: ZkbioConnection, doorId: string, interval: number): Promise<unknown> {
    if (!Number.isInteger(interval) || interval < 1 || interval > 254)
      throw new RangeError('Door interval must be 1..254 seconds');
    return this.request(
      connection,
      '/api/door/remoteOpenById',
      'POST',
      { doorId, interval },
      undefined,
    );
  }

  /** §2.2.2.6. */
  async closeDoor(connection: ZkbioConnection, doorId: string): Promise<unknown> {
    return this.request(connection, '/api/door/remoteCloseById', 'POST', { doorId }, undefined);
  }

  /** §2.2.2.11. */
  async lockDoor(connection: ZkbioConnection, doorId: string): Promise<unknown> {
    return this.request(connection, '/api/door/remoteLockById', 'POST', { doorId }, undefined);
  }

  /** §2.2.2.13. */
  async unlockDoor(connection: ZkbioConnection, doorId: string): Promise<unknown> {
    return this.request(connection, '/api/door/remoteUnlockById', 'POST', { doorId }, undefined);
  }

  /** §2.2.3.3. */
  async listAccessReaders(connection: ZkbioConnection, input: Pagination): Promise<Page<Reader>> {
    return this.request(connection, '/api/v2/reader/list', 'GET', page(input), undefined);
  }

  /** §2.2.4.10. */
  async listAccessLevels(connection: ZkbioConnection, input: Pagination): Promise<Page<Level>> {
    return this.request(connection, '/api/v2/accLevel/list', 'GET', page(input), undefined);
  }

  /** §2.2.4.3. */
  async getAccessLevel(connection: ZkbioConnection, id: string): Promise<Level> {
    return this.request(connection, '/api/v2/accLevel/getById', 'GET', { id }, undefined);
  }

  /** §2.2.4.5. */
  async getAccessLevelByName(connection: ZkbioConnection, name: string): Promise<Level> {
    return this.request(connection, '/api/v2/accLevel/getByName', 'GET', { name }, undefined);
  }

  /** §2.2.4.11. */
  async upsertAccessLevels(connection: ZkbioConnection, input: LevelInput[]): Promise<unknown> {
    return this.request(connection, '/api/accLevel/addLevel', 'POST', {}, input);
  }

  /** §2.2.4.12. */
  async upsertAccessLevelDoors(
    connection: ZkbioConnection,
    input: LevelDoorInput[],
  ): Promise<unknown> {
    return this.request(connection, '/api/accLevel/addLevelDoor', 'POST', {}, input);
  }

  /** §2.2.4.13. */
  async assignAccessLevels(
    connection: ZkbioConnection,
    pin: string,
    levelIds: string[],
  ): Promise<unknown> {
    return this.request(
      connection,
      '/api/accLevel/addLevelPerson',
      'POST',
      { pin, levelIds: levelIds.join(',') },
      undefined,
    );
  }

  /** §2.2.4.1. */
  async deletePersonAccessLevels(
    connection: ZkbioConnection,
    pin: string,
    levelIds: string[],
  ): Promise<unknown> {
    return this.request(
      connection,
      '/api/accLevel/deleteLevel',
      'POST',
      { pin, levelIds: levelIds.join(',') },
      undefined,
    );
  }

  /** §2.2.4.9. */
  async syncAccessPerson(
    connection: ZkbioConnection,
    pin: string,
    levelIds: string[],
  ): Promise<unknown> {
    return this.request(
      connection,
      '/api/accLevel/syncPerson',
      'POST',
      { pin, levelIds: levelIds.join(',') },
      undefined,
    );
  }

  /** §2.2.4.8. */
  async syncAccessLevel(connection: ZkbioConnection, levelId: string): Promise<unknown> {
    return this.request(connection, '/api/accLevel/syncLevel', 'POST', { levelId }, undefined);
  }

  /** §2.2.6.1. */
  async getWhoIsInside(connection: ZkbioConnection, code: string): Promise<Occupant[]> {
    return this.request(
      connection,
      '/api/accAdvanced/getWhoIsInsideByZone',
      'GET',
      { code },
      undefined,
    );
  }

  /** §2.2.7.1. */
  async listAuxiliaryInputs(
    connection: ZkbioConnection,
    input: Pagination,
  ): Promise<Page<Auxiliary>> {
    return this.request(connection, '/api/accAuxIn/list', 'GET', page(input), undefined);
  }

  /** §2.2.8.1. */
  async listAuxiliaryOutputs(
    connection: ZkbioConnection,
    input: Pagination,
  ): Promise<Page<Auxiliary>> {
    return this.request(connection, '/api/accAuxOut/list', 'GET', page(input), undefined);
  }

  /** §2.9.1.3. */
  async listEntranceDevices(connection: ZkbioConnection, input: Pagination): Promise<Page<Device>> {
    return this.request(connection, '/api/v2/psgDevice/list', 'GET', page(input), undefined);
  }

  /** §2.9.1.2. */
  async getEntranceDevice(connection: ZkbioConnection, sn: string): Promise<Device> {
    return this.request(connection, '/api/psgDevice/getBySn', 'GET', { sn }, undefined);
  }

  /** §2.9.2.6. */
  async listGates(connection: ZkbioConnection, input: Pagination): Promise<Page<Door>> {
    return this.request(connection, '/api/v2/psgGate/list', 'GET', page(input), undefined);
  }

  /** §2.9.2.1. */
  async getAllGateStates(connection: ZkbioConnection): Promise<GateState[]> {
    return this.request(connection, '/api/psgGate/allGateState', 'GET', {}, undefined);
  }

  /** §2.9.2.2. */
  async getGateState(connection: ZkbioConnection, gateId: string): Promise<GateState[]> {
    return this.request(connection, '/api/psgGate/gateStateById', 'GET', { gateId }, undefined);
  }

  /** §2.9.2.3. */
  async getGateStatesBySn(connection: ZkbioConnection, deviceSn: string): Promise<GateState[]> {
    return this.request(connection, '/api/psgGate/gateStateBySn', 'GET', { deviceSn }, undefined);
  }

  /** §2.9.2.7. */
  async openGate(connection: ZkbioConnection, gateId: string, openType: 1 | 2): Promise<unknown> {
    if (openType !== 1 && openType !== 2) throw new RangeError('Invalid gate open type');
    return this.request(
      connection,
      '/api/psgGate/remoteOpenById',
      'POST',
      { gateId, openType },
      undefined,
    );
  }

  /** §2.9.2.8. */
  async openGateByName(
    connection: ZkbioConnection,
    gateName: string,
    openType: 1 | 2,
  ): Promise<unknown> {
    if (openType !== 1 && openType !== 2) throw new RangeError('Invalid gate open type');
    return this.request(
      connection,
      '/api/psgGate/remoteOpenByName',
      'POST',
      { gateName, openType },
      undefined,
    );
  }

  /** §2.9.3.9. */
  async listEntranceLevels(connection: ZkbioConnection, input: Pagination): Promise<Page<Level>> {
    return this.request(connection, '/api/v2/psgLevel/list', 'GET', page(input), undefined);
  }

  /** §2.9.3.4. */
  async getEntranceLevel(connection: ZkbioConnection, id: string): Promise<Level> {
    return this.request(
      connection,
      `/api/v2/psgLevel/getById/${segment(id)}`,
      'GET',
      {},
      undefined,
    );
  }

  /** §2.9.3.5. */
  async getEntranceLevelByName(connection: ZkbioConnection, name: string): Promise<Level> {
    return this.request(
      connection,
      `/api/v2/psgLevel/getByName/${segment(name)}`,
      'GET',
      {},
      undefined,
    );
  }

  /** §2.9.3.10. */
  async addEntranceLevelByLevel(
    connection: ZkbioConnection,
    input: LevelPersons[],
  ): Promise<unknown> {
    return this.request(connection, '/api/v2/psgLevel/addLevelByLevel', 'POST', {}, input);
  }

  /** §2.9.3.11. */
  async addEntranceLevelByPerson(
    connection: ZkbioConnection,
    input: PersonLevels[],
  ): Promise<unknown> {
    return this.request(connection, '/api/v2/psgLevel/addLevelByPerson', 'POST', {}, input);
  }

  /** §2.9.3.1. */
  async deletePersonEntranceLevels(
    connection: ZkbioConnection,
    pin: string,
    levelIds: string[],
  ): Promise<unknown> {
    return this.request(
      connection,
      '/api/psgLevel/deleteLevel',
      'POST',
      { pin, levelIds: levelIds.join(',') },
      undefined,
    );
  }

  /** §2.9.3.8. */
  async syncEntrancePerson(
    connection: ZkbioConnection,
    pin: string,
    levelIds: string[],
  ): Promise<unknown> {
    return this.request(
      connection,
      '/api/psgLevel/syncPerson',
      'POST',
      { pin, levelIds: levelIds.join(',') },
      undefined,
    );
  }

  /** §2.9.3.7. */
  async syncEntranceLevel(connection: ZkbioConnection, levelId: string): Promise<unknown> {
    return this.request(connection, '/api/psgLevel/syncLevel', 'POST', { levelId }, undefined);
  }

  /** §2.9.4.2. */
  async listEntranceReaders(connection: ZkbioConnection, input: Pagination): Promise<Page<Reader>> {
    return this.request(connection, '/api/v2/psgReader/list', 'GET', page(input), undefined);
  }

  /** §2.15.1.1. */
  async upsertArea(connection: ZkbioConnection, input: AreaInput): Promise<unknown> {
    return this.request(connection, '/api/area/add', 'POST', {}, input);
  }

  /** §2.15.1.3. */
  async getArea(connection: ZkbioConnection, code: string): Promise<Area> {
    return this.request(connection, '/api/area/get', 'GET', { code }, undefined);
  }

  /** §2.15.1.2. */
  async deleteArea(connection: ZkbioConnection, code: string): Promise<unknown> {
    return this.request(connection, '/api/area/delete', 'POST', { code }, undefined);
  }

  /** §2.15.1.4. */
  async listAreas(connection: ZkbioConnection, input: Pagination): Promise<Page<Area>> {
    return this.request(connection, '/api/area/getAreaList', 'POST', page(input), undefined);
  }

  /** §2.1.1.12: the manual has no separate person-bound-level endpoint.
   * Read accLevelIds from the full personnel record; §2.1.1.5 omits it. */
  async getPersonAccessLevelIds(connection: ZkbioConnection, pin: string): Promise<string[]> {
    const result = await this.listPersons(connection, { pins: [pin], pageNo: 1, pageSize: 1 });
    const person = result.data.find((p) => p.pin === pin);
    if (!person) throw new ZkbioApiError(-22);
    return person.accLevelIds?.split(',').filter(Boolean) ?? [];
  }

  /** §2.2.5.5. */
  async listAccessTransactions(
    connection: ZkbioConnection,
    input: TransactionQuery,
  ): Promise<Page<Transaction>> {
    const result = await this.request<Page<Record<string, unknown>>>(
      connection,
      '/api/v2/transaction/list',
      'GET',
      range(input),
    );
    return { ...result, data: result.data.map((row) => transaction(row, input.utcOffsetMinutes)) };
  }

  /** §2.2.5.3. */
  async getAccessTransactionsBySn(
    connection: ZkbioConnection,
    deviceSn: string,
    input: TransactionQuery,
  ): Promise<Page<Transaction>> {
    const result = await this.request<Page<Record<string, unknown>>>(
      connection,
      '/api/v3/transaction/device',
      'GET',
      { ...range(input), deviceSn },
    );
    return { ...result, data: result.data.map((row) => transaction(row, input.utcOffsetMinutes)) };
  }

  /** §2.2.5.9. */
  async getAccessTransactionsByPin(
    connection: ZkbioConnection,
    pin: string,
    input: TransactionQuery,
  ): Promise<Page<Transaction>> {
    const result = await this.request<Page<Record<string, unknown>>>(
      connection,
      '/api/v3/transaction/person',
      'GET',
      { ...range(input), pin },
    );
    return { ...result, data: result.data.map((row) => transaction(row, input.utcOffsetMinutes)) };
  }

  /** §2.9.5.5. */
  async listEntranceTransactions(
    connection: ZkbioConnection,
    input: TransactionQuery,
  ): Promise<Page<Transaction>> {
    const result = await this.request<Page<Record<string, unknown>>>(
      connection,
      '/api/v2/psgTransaction/list',
      'GET',
      range(input),
    );
    return { ...result, data: result.data.map((row) => transaction(row, input.utcOffsetMinutes)) };
  }

  /** §2.9.5.3. */
  async getEntranceTransactionsBySn(
    connection: ZkbioConnection,
    deviceSn: string,
    input: TransactionQuery,
  ): Promise<Page<Transaction>> {
    const result = await this.request<Page<Record<string, unknown>>>(
      connection,
      `/api/v3/psgTransaction/device/${segment(deviceSn)}`,
      'GET',
      range(input),
    );
    return { ...result, data: result.data.map((row) => transaction(row, input.utcOffsetMinutes)) };
  }

  /** §2.9.5.9. */
  async getEntranceTransactionsByPin(
    connection: ZkbioConnection,
    pin: string,
    input: TransactionQuery,
  ): Promise<Page<Transaction>> {
    const result = await this.request<Page<Record<string, unknown>>>(
      connection,
      `/api/v3/psgTransaction/person/${segment(pin)}`,
      'GET',
      range(input),
    );
    return { ...result, data: result.data.map((row) => transaction(row, input.utcOffsetMinutes)) };
  }

  /** §2.2.5.6. Reuse the first timestamp; poll at least 10 seconds apart. */
  async monitorAccessTransactions(
    connection: ZkbioConnection,
    timestamp: number,
    utcOffsetMinutes: number,
  ): Promise<Transaction[]> {
    const result = await this.request<Record<string, unknown>[]>(
      connection,
      '/api/transaction/monitor',
      'GET',
      { timestamp },
    );
    return result.map((row) => transaction(row, utcOffsetMinutes));
  }

  /** §2.9.5.6. Reuse the first timestamp; poll at least 10 seconds apart. */
  async monitorEntranceTransactions(
    connection: ZkbioConnection,
    timestamp: number,
    utcOffsetMinutes: number,
  ): Promise<Transaction[]> {
    const result = await this.request<Record<string, unknown>[]>(
      connection,
      '/api/psgTransaction/monitor',
      'GET',
      { timestamp },
    );
    return result.map((row) => transaction(row, utcOffsetMinutes));
  }

  /** §2.2.5.17: despite “With Total Number”, data is a single event. */
  async getAccessTransaction(
    connection: ZkbioConnection,
    id: string,
    utcOffsetMinutes: number,
  ): Promise<Transaction> {
    return transaction(
      await this.request(connection, '/api/v2/transaction/getById', 'GET', { id }),
      utcOffsetMinutes,
    );
  }
  /** §2.2.5.12: heading says V3; request URL explicitly says /v2/. */
  async getFirstInLastOut(
    connection: ZkbioConnection,
    pin: string,
    input: Pagination & TimeRange,
  ): Promise<Page<FirstInLastOut>> {
    const result = await this.request<Page<Record<string, unknown>>>(
      connection,
      '/api/v2/transaction/firstInAndLastOut',
      'GET',
      { ...range(input), pin },
    );
    return {
      ...result,
      data: result.data.map(
        (row) =>
          ({
            ...row,
            firstInTime:
              row.firstInTime == null
                ? null
                : responseDate(row.firstInTime, input.utcOffsetMinutes),
            lastOutTime:
              row.lastOutTime == null
                ? null
                : responseDate(row.lastOutTime, input.utcOffsetMinutes),
          }) as unknown as FirstInLastOut,
      ),
    };
  }

  private async request<T>(
    connection: ZkbioConnection,
    path: string,
    method: 'GET' | 'POST',
    query: Query = {},
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ZkbioTransportError('timeout'));
      }, 10_000);
    });
    try {
      return await Promise.race([
        timeout,
        (async () => {
          const base = normalizeBaseUrl(connection.baseUrl);
          const addresses = await assertPublicHost(base);
          if (controller.signal.aborted) throw new ZkbioTransportError('timeout');
          const url = new URL(base + path);
          for (const [key, value] of Object.entries(query))
            if (value !== undefined) url.searchParams.set(key, String(value));
          url.searchParams.set('access_token', connection.apiToken);
          const init: RequestInit = {
            method,
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: controller.signal,
            redirect: 'manual',
          };
          const response = this.options.fetch
            ? await this.options.fetch(url.toString(), init)
            : await pinnedFetch(url, init, addresses);
          if (response.status === 401 || response.status === 403)
            throw new ZkbioTransportError('unauthorized');
          if (!response.ok) throw new ZkbioTransportError('unreachable');
          const reply: unknown = await response.json();
          if (
            !isRecord(reply) ||
            typeof reply.code !== 'number' ||
            !Number.isInteger(reply.code) ||
            typeof reply.message !== 'string'
          )
            throw new ZkbioTransportError('not_zkbio');
          if (reply.code < 0) throw new ZkbioApiError(reply.code);
          if (!('data' in reply)) throw new ZkbioTransportError('not_zkbio');
          return reply.data as T;
        })(),
      ]);
    } catch (error) {
      if (error instanceof ZkbioApiError || error instanceof ZkbioTransportError) throw error;
      if (controller.signal.aborted) throw new ZkbioTransportError('timeout');
      if (error instanceof SyntaxError) throw new ZkbioTransportError('not_zkbio');
      // Never retain native error.message, URL, cause or vendor response text.
      throw new ZkbioTransportError('unreachable');
    } finally {
      clearTimeout(timer);
    }
  }
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function segment(value: string): string {
  if (!value || value === '.' || value === '..') throw new RangeError('Invalid ZKBio identifier');
  return encodeURIComponent(value);
}
function page(input: Pagination): Query {
  if (
    !Number.isSafeInteger(input.pageNo) ||
    input.pageNo < 1 ||
    !Number.isInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > 1000
  )
    throw new RangeError('Invalid ZKBio pagination');
  return { pageNo: input.pageNo, pageSize: input.pageSize };
}
function range(input: Pagination & TimeRange & { personPin?: string }): Query {
  if (input.startDate && input.endDate && input.startDate > input.endDate)
    throw new RangeError('Invalid ZKBio time range');
  return {
    ...page(input),
    personPin: input.personPin,
    startDate: input.startDate && formatZkbioDate(input.startDate, input.utcOffsetMinutes),
    endDate: input.endDate && formatZkbioDate(input.endDate, input.utcOffsetMinutes),
  };
}
function personBody(input: PersonInput, offset: number) {
  return {
    ...input,
    accStartTime: input.accStartTime && formatZkbioDate(input.accStartTime, offset),
    accEndTime: input.accEndTime && formatZkbioDate(input.accEndTime, offset),
  };
}
function transaction(row: Record<string, unknown>, offset: number): Transaction {
  return {
    ...row,
    eventTime: responseDate(row.eventTime, offset),
  } as unknown as Transaction;
}
/** Native transport supplies the vetted address directly to lookup, preserving TLS SNI
 * and Host. No redirects, no second DNS resolution and no cross-tenant socket reuse. */
function pinnedFetch(url: URL, init: RequestInit, addresses: VettedAddress[]): Promise<Response> {
  return new Promise((resolve, reject) => {
    const address = addresses[0]!;
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(
      url,
      {
        method: init.method,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        agent: false,
        signal: init.signal ?? undefined,
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, addresses);
          else callback(null, address.address, address.family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          // Photos can be large, but an untrusted server must not exhaust memory.
          if (size > 32 * 1024 * 1024) {
            req.destroy();
            reject(new ZkbioTransportError('unreachable'));
          } else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => {
          const status = res.statusCode ?? 502;
          resolve(
            new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks), {
              status,
            }),
          );
        });
      },
    );
    req.on('error', reject);
    req.end(init.body);
  });
}

function responseDate(value: unknown, offset: number): Date {
  if (typeof value !== 'string') throw new ZkbioTransportError('not_zkbio');
  try {
    return parseZkbioDate(value, offset);
  } catch {
    throw new ZkbioTransportError('not_zkbio');
  }
}
