import { describe, expect, it } from 'vitest';
import { ALL_ENDPOINTS, CORE_TOOLS, TOOL_DOMAINS } from './catalog';
import manifest from './tool-manifest.json';

const endpoint = (name: string) => {
  const found = ALL_ENDPOINTS.find((item) => item.name === name);
  if (!found) throw new Error(`unknown tool ${name}`);
  return found;
};

/** Each tool's description must name the tools a model is likely to confuse it with. */
const COUNTERPARTS: Record<string, string[]> = {
  list_classes: ['list_schedule'],
  list_schedule: ['list_classes', 'get_schedule_instance'],
  get_schedule_instance: ['get_attendance'],
  get_attendance: ['get_schedule_instance', 'mark_attendance'],
  list_pt_sessions: ['list_service_sessions', 'list_services'],
  list_service_sessions: ['list_pt_sessions', 'list_services'],
  list_services: ['list_service_sessions', 'list_pt_sessions'],
  list_credit_pack_catalogue: ['list_package_plans', 'grant_member_credit_pack'],
  list_package_plans: ['list_credit_pack_catalogue'],
  list_member_credit_packs: ['list_credit_pack_catalogue'],
  list_staff: ['list_trainers', 'staffId', 'trainerId'],
  list_trainers: ['list_staff', 'trainerId', 'create_pt_session'],
  list_service_staff: ['list_staff', 'list_trainers', 'staffId', 'trainerId'],
  record_pos_sale: ['enroll_subscription', 'grant_member_credit_pack'],
  enroll_subscription: ['record_pos_sale', 'grant_member_credit_pack'],
  grant_member_credit_pack: ['record_pos_sale', 'enroll_subscription'],
  list_activity: ['list_audit_logs'],
  list_audit_logs: ['list_activity'],
  dashboard_stats: ['run_report'],
  get_dashboard_overview: ['run_report', 'get_analytics'],
  get_dashboard_sales: ['run_report', 'run_report_drilldown'],
  get_dashboard_members: ['run_report', 'run_report_drilldown'],
  get_dashboard_revenue: ['run_report', 'run_report_drilldown'],
  get_dashboard_classes: ['run_report', 'run_report_drilldown'],
  get_dashboard_staff: ['run_report', 'run_report_drilldown'],
  run_report: ['get_dashboard_', 'run_report_drilldown', 'get_analytics'],
  run_report_drilldown: ['get_dashboard_', 'run_report', 'get_analytics'],
  get_analytics: ['get_dashboard_', 'run_report', 'run_report_drilldown'],
  set_member_status: ['trash_member', 'restore_member'],
  trash_member: ['set_member_status', 'restore_member'],
  get_gym_settings: ['get_mobile_app_settings'],
  get_mobile_app_settings: ['get_gym_settings'],
  update_mobile_app_settings: ['get_mobile_app_settings'],
};

describe('MCP tool descriptions steer the model to the right tool', () => {
  it.each(Object.entries(COUNTERPARTS))('%s names its counterparts', (name, others) => {
    const { description } = endpoint(name);
    expect(description.length).toBeGreaterThanOrEqual(30);
    for (const other of others) expect(description, name).toContain(other);
  });

  it('keeps the model from inventing intake data or listing templates for an empty week', () => {
    expect(endpoint('create_member').description).toContain('never invent');
    expect(endpoint('list_schedule').description).toContain('empty');
    expect(endpoint('list_classes').description).toContain('empty');
  });

  it('documents every active/inactive toggle as a boolean with both routes', () => {
    const toggles = ALL_ENDPOINTS.filter((item) => item.activePath);
    expect(toggles.length).toBeGreaterThanOrEqual(7);
    for (const toggle of toggles) {
      expect(toggle.description, toggle.name).toContain('boolean, not a status string');
      expect(toggle.description, toggle.name).toMatch(/active: true = \w+.*false = \w+/);
    }
  });

  it('keeps Georgian titles free of dashes and Mtavruli capitals', () => {
    for (const item of ALL_ENDPOINTS) {
      expect(item.titleKa, item.name).not.toMatch(/[–—]/);
      expect(item.titleKa, item.name).not.toMatch(/[Ა-Ჿ]/);
    }
    for (const domain of TOOL_DOMAINS) {
      expect(domain.titleKa, domain.id).not.toMatch(/[–—Ა-Ჿ]/);
    }
  });
});

describe('mobile app settings tools', () => {
  it('live in the settings domain, are not core and never delete', () => {
    const settings = TOOL_DOMAINS.find((domain) => domain.id === 'settings')!;
    expect(settings.tools).toEqual(
      expect.arrayContaining(['get_mobile_app_settings', 'update_mobile_app_settings']),
    );
    expect(CORE_TOOLS).not.toContain('get_mobile_app_settings');
    expect(endpoint('update_mobile_app_settings').destructive).toBe(false);
    for (const name of ['get_mobile_app_settings', 'update_mobile_app_settings']) {
      expect(
        manifest.find((route) => route.name === name),
        name,
      ).toMatchObject({
        path: '/gyms/app-settings',
        controller: 'gyms/mobile-app-settings.controller.ts',
      });
    }
  });

  it('expose no uploads, exports, PDFs or agent routes', () => {
    for (const route of manifest) {
      expect(route.path, route.name).not.toMatch(/^\/gyms\/app-settings\/login-image/);
      expect(route.path, route.name).not.toMatch(/^\/agent(\/|$)/);
      expect(route.path, route.name).not.toContain('/export');
      expect(route.path, route.name).not.toContain('/pdf');
    }
  });
});
