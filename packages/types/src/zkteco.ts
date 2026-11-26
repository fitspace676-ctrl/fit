import { z } from 'zod';

/*
 * ZKTeco turnstiles and doors, connected per gym by the OWNER on the
 * Integrations page like Flitt and Sender.ge. Two ways to connect:
 *
 *   • `zkbio`  — the gym's ZKBio CVSecurity server over its REST API (address +
 *     API token). Every model the server manages works through it: access
 *     controllers (doors), entrance controllers (flap/swing/tripod gates) and
 *     their readers, with access/entrance levels and a validity window.
 *   • `device` — one standalone ZK device over TCP 4370 (host, port, comm key).
 *     The protocol has no portable "disabled" bit, no levels and no photos, so
 *     the only expiry action is deleting the user from the device.
 *
 * The card reads {@link ZKTECO_CAPABILITIES} for the connection type and hides
 * what that type cannot do; the API refuses those settings as well.
 */

export const zktecoConnectionTypeSchema = z.enum(['zkbio', 'device']);
export type ZktecoConnectionType = z.infer<typeof zktecoConnectionTypeSchema>;

/** Body for `PUT /integrations/zkteco`. Verified against the server/device before it is stored. */
export const connectZktecoSchema = z.discriminatedUnion('connectionType', [
  z.object({
    connectionType: z.literal('zkbio'),
    /** `https://bio.example.ge:8098`. A public address: LAN addresses are refused. */
    baseUrl: z.string().trim().url().max(300),
    apiToken: z.string().trim().min(1).max(500),
  }),
  z.object({
    connectionType: z.literal('device'),
    /** Public IP or host name of the device (port-forwarded); LAN addresses are refused. */
    host: z.string().trim().min(1).max(253),
    port: z.number().int().min(1).max(65535).default(4370),
    deviceNumber: z.number().int().min(1).max(65535).default(1),
    /** The device's communication password; 0 when none is set. */
    commKey: z.number().int().min(0).max(999999).default(0),
    /**
     * User record layout. Only needed when the device has no users yet (the
     * layout is read from existing users otherwise): 28 on older black-and-white
     * models, 72 on TFT/colour models.
     */
    recordSize: z.union([z.literal(28), z.literal(72)]).optional(),
  }),
]);
export type ConnectZktecoInput = z.infer<typeof connectZktecoSchema>;

/** What happens on the turnstile when a membership ends. */
export const zktecoOnExpirySchema = z.enum(['remove_access', 'disable', 'delete']);
export type ZktecoOnExpiry = z.infer<typeof zktecoOnExpirySchema>;

/** The door or gate the console's "open door" action opens. */
export const zktecoDoorTargetSchema = z.object({
  kind: z.enum(['door', 'gate']),
  id: z.string().trim().min(1).max(100),
});
export type ZktecoDoorTarget = z.infer<typeof zktecoDoorTargetSchema>;

const resourceId = z.string().trim().min(1).max(100);

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Everything chosen on the ZKTeco card. Stored on the integration; PATCH merges. */
export const zktecoSettingsSchema = z.object({
  /** Push members (PIN, name, validity) to the server/device as memberships change. */
  syncMembers: z.boolean(),
  /** Include the member's access card number. */
  syncCard: z.boolean(),
  /** Include the member's profile photo for face readers (zkbio only). */
  syncPhoto: z.boolean(),
  /** zkbio: access levels (doors) granted to every active member. */
  accessLevelIds: z.array(resourceId).max(50),
  /** zkbio: entrance levels (gates) granted to every active member. */
  entranceLevelIds: z.array(resourceId).max(50),
  onExpiry: zktecoOnExpirySchema,
  /** Treat a frozen membership as ended until it is unfrozen. */
  blockOnFreeze: z.boolean(),
  /** Turn every passage into a check-in (method TURNSTILE). */
  importEvents: z.boolean(),
  /**
   * Device serial number (or, for a standalone device, its serial as reported by
   * the device) → our branch id. An unmapped device's passages land on the gym's
   * default branch.
   */
  deviceLocations: z
    .record(resourceId, resourceId)
    .refine((map) => Object.keys(map).length <= 200, 'Too many devices'),
  /** The console's "open door" target. A standalone device always opens its own lock. */
  checkInDoor: zktecoDoorTargetSchema.nullable(),
  /** How long the console's "open door" keeps the lock released, in seconds. */
  openSeconds: z.number().int().min(1).max(60),
  /** zkbio: the zone whose occupants "who is inside" lists. */
  insideZoneCode: z.string().trim().min(1).max(100).nullable(),
  /** IANA zone the server/device clock runs in (event times and validity windows). */
  timeZone: z.string().trim().min(1).max(64).refine(isTimeZone, 'Unknown time zone'),
});
export type ZktecoSettings = z.infer<typeof zktecoSettingsSchema>;

/** Body for `PATCH /integrations/zkteco/settings`: any subset; the rest is kept. */
export const updateZktecoSettingsSchema = zktecoSettingsSchema.partial();
export type UpdateZktecoSettingsInput = z.infer<typeof updateZktecoSettingsSchema>;

export const DEFAULT_ZKTECO_SETTINGS: ZktecoSettings = {
  syncMembers: true,
  syncCard: true,
  syncPhoto: false,
  accessLevelIds: [],
  entranceLevelIds: [],
  onExpiry: 'remove_access',
  blockOnFreeze: true,
  importEvents: true,
  deviceLocations: {},
  checkInDoor: null,
  openSeconds: 5,
  insideZoneCode: null,
  timeZone: 'Asia/Tbilisi',
};

/** Defaults for a standalone device, which supports only deletion on expiry. */
export const DEFAULT_ZKTECO_DEVICE_SETTINGS: ZktecoSettings = {
  ...DEFAULT_ZKTECO_SETTINGS,
  onExpiry: 'delete',
};

/** What a connection type can do: the card hides everything that is `false`/absent. */
export const zktecoCapabilitiesSchema = z.object({
  /** Expiry actions this type supports, in the order the card offers them. */
  onExpiry: z.array(zktecoOnExpirySchema),
  syncCard: z.boolean(),
  syncPhoto: z.boolean(),
  accessLevels: z.boolean(),
  entranceLevels: z.boolean(),
  /** Membership end date enforced by the controller itself. */
  validityWindow: z.boolean(),
  remoteOpen: z.boolean(),
  /** Whether the owner picks which door/gate "open door" opens. */
  chooseDoor: z.boolean(),
  whoIsInside: z.boolean(),
  importEvents: z.boolean(),
  deviceLocations: z.boolean(),
});
export type ZktecoCapabilities = z.infer<typeof zktecoCapabilitiesSchema>;

export const ZKTECO_CAPABILITIES: Record<ZktecoConnectionType, ZktecoCapabilities> = {
  zkbio: {
    onExpiry: ['remove_access', 'disable', 'delete'],
    syncCard: true,
    syncPhoto: true,
    accessLevels: true,
    entranceLevels: true,
    validityWindow: true,
    remoteOpen: true,
    chooseDoor: true,
    whoIsInside: true,
    importEvents: true,
    deviceLocations: true,
  },
  device: {
    onExpiry: ['delete'],
    syncCard: true,
    syncPhoto: false,
    accessLevels: false,
    entranceLevels: false,
    validityWindow: false,
    remoteOpen: true,
    chooseDoor: false,
    whoIsInside: false,
    importEvents: true,
    deviceLocations: true,
  },
};

/** Non-secret connection details the card may show. Token and comm key never leave the API. */
export const zktecoConnectionInfoSchema = z.object({
  connectionType: zktecoConnectionTypeSchema,
  baseUrl: z.string().nullable(),
  host: z.string().nullable(),
  port: z.number().int().nullable(),
  deviceNumber: z.number().int().nullable(),
  recordSize: z.union([z.literal(28), z.literal(72)]).nullable(),
});
export type ZktecoConnectionInfo = z.infer<typeof zktecoConnectionInfoSchema>;

/** `GET /integrations/zkteco` and every ZKTeco write that returns the integration. */
export const zktecoIntegrationSchema = z.object({
  provider: z.literal('zkteco'),
  connected: z.boolean(),
  enabled: z.boolean(),
  connection: zktecoConnectionInfoSchema.nullable(),
  /** Last two characters of the API token; always null for a device comm key. */
  secretHint: z.string().nullable(),
  verifiedAt: z.string().datetime().nullable(),
  lastError: z.string().nullable(),
  settings: zktecoSettingsSchema,
  /** Null until connected. */
  capabilities: zktecoCapabilitiesSchema.nullable(),
});
export type ZktecoIntegration = z.infer<typeof zktecoIntegrationSchema>;

export const zktecoFailureReasonSchema = z.enum([
  'unauthorized',
  'unreachable',
  'timeout',
  'not_zkbio',
  'blocked_host',
  'invalid_connection',
  'protocol',
]);
export type ZktecoFailureReason = z.infer<typeof zktecoFailureReasonSchema>;

/** `POST /integrations/zkteco/test`. */
export const zktecoTestResponseSchema = z.object({
  ok: z.boolean(),
  reason: zktecoFailureReasonSchema.optional(),
  /** Standalone device only: what the device reported about itself. */
  device: z
    .object({
      serialNumber: z.string().nullable(),
      deviceName: z.string().nullable(),
      firmwareVersion: z.string().nullable(),
      userCount: z.number().int().nullable(),
      userCapacity: z.number().int().nullable(),
    })
    .optional(),
});
export type ZktecoTestResponse = z.infer<typeof zktecoTestResponseSchema>;

const namedResource = z.object({ id: z.string(), name: z.string() });

/** `GET /integrations/zkteco/resources`: what the settings pickers choose from. */
export const zktecoResourcesSchema = z.object({
  devices: z.array(
    z.object({
      /** Serial number: the key {@link ZktecoSettings.deviceLocations} uses. */
      sn: z.string(),
      name: z.string(),
      module: z.enum(['access', 'entrance', 'device']),
      online: z.boolean().nullable(),
    }),
  ),
  doors: z.array(namedResource.extend({ deviceId: z.string().nullable() })),
  gates: z.array(namedResource.extend({ deviceId: z.string().nullable() })),
  readers: z.array(
    namedResource.extend({ doorId: z.string().nullable(), gateId: z.string().nullable() }),
  ),
  accessLevels: z.array(namedResource),
  entranceLevels: z.array(namedResource),
  areas: z.array(z.object({ code: z.string(), name: z.string() })),
  /** Lists the server refused (module not licensed, older version): shown as unavailable. */
  unavailable: z.array(
    z.enum(['devices', 'doors', 'gates', 'readers', 'accessLevels', 'entranceLevels', 'areas']),
  ),
});
export type ZktecoResources = z.infer<typeof zktecoResourcesSchema>;

/** `GET /integrations/zkteco/status`. */
export const zktecoSyncStatusSchema = z.object({
  /** A full sync or reconcile is running for this gym right now. */
  running: z.boolean(),
  lastSyncAt: z.string().datetime().nullable(),
  lastReconcileAt: z.string().datetime().nullable(),
  lastImportAt: z.string().datetime().nullable(),
  lastEventAt: z.string().datetime().nullable(),
  members: z.object({
    /** Members whose turnstile record matches their membership. */
    synced: z.number().int(),
    /** Changes waiting for the next sync. */
    pending: z.number().int(),
    /** Members the last attempt could not update. */
    failed: z.number().int(),
  }),
  events: z.object({
    /** Passages turned into check-ins, in total. */
    imported: z.number().int(),
    /** Passages by PINs this gym does not know, in total. */
    ignoredUnknown: z.number().int(),
  }),
  lastError: z.string().nullable(),
  lastErrorAt: z.string().datetime().nullable(),
});
export type ZktecoSyncStatus = z.infer<typeof zktecoSyncStatusSchema>;

/** `POST /integrations/zkteco/sync`: the full sync runs in the background. */
export const zktecoSyncStartResponseSchema = z.object({
  accepted: z.boolean(),
  reason: z.enum(['already_running', 'not_enabled']).optional(),
});
export type ZktecoSyncStartResponse = z.infer<typeof zktecoSyncStartResponseSchema>;

/** Body for `POST /integrations/zkteco/open-door`; omitted target = the card's choice. */
export const zktecoOpenDoorSchema = z.object({
  target: zktecoDoorTargetSchema.optional(),
});
export type ZktecoOpenDoorInput = z.infer<typeof zktecoOpenDoorSchema>;

/** Result of one remote open. Never retried: a timeout may still have opened the door. */
export const zktecoOpenDoorResponseSchema = z.object({
  ok: z.boolean(),
  reason: z
    .enum(['no_door_selected', 'unreachable', 'timeout', 'unauthorized', 'rejected'])
    .optional(),
});
export type ZktecoOpenDoorResponse = z.infer<typeof zktecoOpenDoorResponseSchema>;

/** `GET /integrations/zkteco/inside` (zkbio only). */
export const zktecoInsideResponseSchema = z.object({
  zoneCode: z.string(),
  people: z.array(
    z.object({
      pin: z.string(),
      gymMemberId: z.string().nullable(),
      name: z.string().nullable(),
    }),
  ),
});
export type ZktecoInsideResponse = z.infer<typeof zktecoInsideResponseSchema>;

/** Body for `PUT /integrations/zkteco/members/:gymMemberId/card`; null removes the card. */
export const setMemberAccessCardSchema = z.object({
  cardNumber: z
    .string()
    .trim()
    .regex(/^\d{1,10}$/)
    .refine((value) => Number(value) <= 0xffffffff, 'Card number too large')
    .nullable(),
});
export type SetMemberAccessCardInput = z.infer<typeof setMemberAccessCardSchema>;
