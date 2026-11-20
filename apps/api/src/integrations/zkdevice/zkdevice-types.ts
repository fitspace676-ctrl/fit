export interface ZkDeviceConnection {
  host: string;
  port?: number;
  commKey?: number;
  /** CRM metadata only: TCP sessions are addressed by host, not machine number. */
  deviceNumber?: number;
}

/** No UTC assumption: timestamp is a device-local ISO wall clock, without Z. */
export interface ZkWallTime {
  local: string;
  timeZone: string;
}
export interface ZkUser {
  uid: number;
  userId: string;
  name: string;
  card: number;
  privilege: number;
  /** Firmware-specific disable bit is not assumed. */
  enabled: boolean | null;
  recordSize: 28 | 72;
}
export interface ZkUserInput {
  uid: number;
  userId: string;
  name: string;
  card?: number;
  privilege?: number;
  /** Any explicit enabled value is rejected: no portable enabled bit exists. */
  enabled?: boolean;
  /** Required for a new user on an empty device; never guess firmware. */
  recordSize?: 28 | 72;
}
export interface ZkAttendance {
  userId: string;
  timestamp: ZkWallTime;
  punchState: number;
  verifyType: number;
}
export interface ZkAttendanceOptions {
  timeZone: string;
  /** Device-local ISO wall clock in the same time zone, not a UTC instant. */
  since?: string;
}
export interface ZkDeviceInfo {
  serialNumber?: string;
  deviceName?: string;
  platform?: string;
  firmwareVersion?: string;
  mac?: string;
  faceFunction?: string;
  fingerprintVersion?: string;
  userCount?: number;
  logCount?: number;
  userCapacity?: number;
  logCapacity?: number;
}
