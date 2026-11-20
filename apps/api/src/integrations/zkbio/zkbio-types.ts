export interface ZkbioConnection {
  baseUrl: string;
  apiToken: string;
}
export interface Pagination {
  pageNo: number;
  pageSize: number;
}
/** Response page can be zero- or one-based depending on vendor version; preserve it. */
export interface Page<T> {
  page: number;
  size: number;
  total: number;
  data: T[];
  offset?: number;
  lastPage?: boolean;
}
export interface TimeRange {
  startDate?: Date;
  endDate?: Date;
  utcOffsetMinutes: number;
}
export interface TransactionQuery extends Pagination, TimeRange {
  personPin?: string;
}
export interface PersonInput {
  pin: string;
  name?: string;
  lastName?: string;
  gender?: 'M' | 'F';
  cardNo?: string;
  mobilePhone?: string;
  email?: string;
  deptCode?: string;
  personPhoto?: string;
  isDisabled?: boolean;
  accLevelIds?: string;
  accStartTime?: Date;
  accEndTime?: Date;
  personPwd?: string;
  birthday?: string;
  hireDate?: string;
  carPlate?: string;
  certNumber?: string;
  certType?: string;
  isSendMail?: boolean;
  ssn?: string;
  supplyCards?: string;
}
export interface Person extends Omit<PersonInput, 'accStartTime' | 'accEndTime'> {
  id?: string;
  deptName?: string;
  accStartTime?: Date | null;
  accEndTime?: Date | null;
  vislightPhoto?: string;
  vislightPhotoPath?: string;
}
export interface Department {
  code: string;
  name: string;
  parentCode?: string | null;
  sortNo?: number;
}
export interface Area {
  code: string;
  name: string;
  parentAreaCode?: string | null;
}
/** §2.15.1.1 example says parentCode, description says parentAreaCode; send the example. */
export interface AreaInput {
  code: string;
  name: string;
  parentCode?: string;
}
export interface Card {
  pin: string;
  cardNo: string;
  cardType: '0' | '1';
}
export interface BioTemplate {
  id: string;
  pin: string;
  validType: string;
  bioType: number;
  version: string;
  template: string;
  templateNo: string;
  templateNoIndex?: number;
}
export interface Device {
  id: string;
  sn: string;
  name: string;
  type: string;
  state?: string;
  status?: string;
  module: string;
  gateType?: string;
}
export interface Door {
  id: string;
  name: string;
  deviceId: string;
}
export interface DoorState extends Door {
  connect: string;
  sensor: string;
  alarm: string;
  relay: string;
}
export interface GateState extends Door {
  connect: string;
  gateState: string;
  alarm: string;
  relay: string;
}
export interface Reader {
  id: string;
  name: string;
  doorId?: string;
  gateId?: string;
  readerNo: number;
  readerState: number;
}
export interface Level {
  id: string;
  name: string;
}
export interface LevelInput {
  name: string;
  areaName: string;
  timeSegName: string;
}
export interface LevelDoorInput {
  levelName: string;
  doorName: string;
}
export interface LevelPersons {
  levelId: string;
  pins: string[];
}
export interface PersonLevels {
  pin: string;
  levelIds: string[];
}
export interface Transaction {
  id?: string | number | null;
  eventTime: Date;
  pin: string;
  name?: string;
  lastName?: string;
  deptName?: string;
  areaName?: string;
  cardNo?: string;
  devSn?: string;
  verifyModeName?: string;
  eventName?: string;
  eventPointName?: string;
  readerName?: string;
  readerState?: number;
  accZone?: string | null;
  devName?: string;
  logId?: number;
  eventNo?: number;
  eventLevel?: number;
  doorName?: string;
  doorNumber?: number;
  capturePhotoBase64?: string;
  gateType?: number;
}
export interface FirstInLastOut {
  id: string;
  pin: string;
  name?: string;
  lastName?: string;
  readerNameIn?: string | null;
  firstInTime: Date | null;
  readerNameOut?: string | null;
  lastOutTime: Date | null;
  deptCode?: string;
  deptName?: string;
}
export interface Occupant {
  zoneId: string;
  zoneName: string;
  pin: string;
}
export interface Auxiliary {
  id: string;
  deviceId: string;
  name: string;
  auxNo: number;
}
export type ConnectionCheck =
  | { ok: true }
  | { ok: false; reason: 'unauthorized' | 'unreachable' | 'not_zkbio' };

function assertOffset(offset: number): void {
  if (!Number.isInteger(offset) || Math.abs(offset) > 840)
    throw new RangeError('Invalid UTC offset');
}
export function formatZkbioDate(date: Date, utcOffsetMinutes: number): string {
  assertOffset(utcOffsetMinutes);
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid date');
  const shifted = new Date(date.getTime() + utcOffsetMinutes * 60000);
  const iso = shifted.toISOString();
  if (iso.length !== 24) throw new RangeError('Invalid date year');
  return iso.slice(0, 19).replace('T', ' ');
}
export function parseZkbioDate(value: string, utcOffsetMinutes: number): Date {
  assertOffset(utcOffsetMinutes);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value))
    throw new RangeError('Invalid ZKBio date');
  const date = new Date(Date.parse(value.replace(' ', 'T') + 'Z') - utcOffsetMinutes * 60000);
  if (!Number.isFinite(date.getTime()) || formatZkbioDate(date, utcOffsetMinutes) !== value)
    throw new RangeError('Invalid ZKBio date');
  return date;
}
