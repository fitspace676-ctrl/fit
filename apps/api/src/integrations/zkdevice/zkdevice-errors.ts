export type ZkDeviceErrorReason =
  | 'invalid_connection'
  | 'blocked_host'
  | 'unauthorized'
  | 'unreachable'
  | 'timeout'
  | 'aborted'
  | 'protocol'
  | 'rejected'
  | 'unsupported_layout'
  | 'unsupported_operation'
  | 'invalid_argument'
  | 'busy';

/** Never retain native errors, connection details, credentials or device payloads. */
export class ZkDeviceError extends Error {
  constructor(readonly reason: ZkDeviceErrorReason) {
    super(`ZK device request failed (${reason})`);
    this.name = 'ZkDeviceError';
  }
}
