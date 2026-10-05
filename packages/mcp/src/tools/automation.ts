import { z } from 'zod';
import {
  createAutomationRuleSchema,
  listAutomationRulesQuerySchema,
  listAutomationRunsQuerySchema,
  saveAsTemplateSchema,
  toggleAutomationRuleSchema,
  updateAutomationRuleSchema,
} from '@fit/types';
import { listOf, slimAutomationRule, slimAutomationRun } from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/automation/automation.controller.ts. */
export const automationTools = defineTools('marketing', [
  {
    name: 'automation_catalog',
    title: 'Automation catalog',
    titleKa: 'ავტომატიზაციის კატალოგი',
    description:
      'List the available automation triggers, actions and timing options. Use before create_automation_rule to pick valid triggerType and actionType values.',
    method: 'get',
    path: '/automation/catalog',
  },
  {
    name: 'list_automation_templates',
    project: listOf(slimAutomationRule),
    title: 'List automation templates',
    titleKa: 'ავტომატიზაციის შაბლონები',
    description:
      "List reusable automation templates, newest first: id, name, trigger and action. Use get_automation_rule for a template's full configuration.",
    method: 'get',
    path: '/automation/templates',
  },
  {
    name: 'get_automation_stats',
    title: 'Get automation stats',
    titleKa: 'ავტომატიზაციის სტატისტიკა',
    description:
      'Read headline automation numbers: total and active rules, total runs, messages sent overall and in the last 30 days. Use for a quick overview before listing rules.',
    method: 'get',
    path: '/automation/stats',
  },
  {
    name: 'list_automation_rules',
    project: listOf(slimAutomationRule),
    title: 'List automation rules',
    titleKa: 'ავტომატიზაციის წესები',
    description:
      'List automation rules (not templates) page by page: id, name, active flag, trigger and action. Use get_automation_rule for configuration and recent runs.',
    method: 'get',
    path: '/automation/rules',
    query: listAutomationRulesQuerySchema,
  },
  {
    name: 'get_automation_rule',
    title: 'Get automation rule',
    titleKa: 'ავტომატიზაციის წესის დეტალები',
    description:
      'Read one automation rule in full: trigger and its settings, timing, action and its settings, active flag and recent runs. Use before update_automation_rule.',
    method: 'get',
    path: '/automation/rules/:id',
    params: id,
  },
  {
    name: 'list_automation_runs',
    project: listOf(slimAutomationRun),
    title: 'List automation runs',
    titleKa: 'ავტომატიზაციის გაშვებები',
    description:
      "List an automation rule's execution history, newest first: status, trigger, detail and time. Use to check whether a rule fired or failed.",
    method: 'get',
    path: '/automation/rules/:id/runs',
    query: listAutomationRunsQuerySchema,
    params: id,
  },
  {
    name: 'create_automation_rule',
    title: 'Create automation rule',
    titleKa: 'ავტომატიზაციის წესის შექმნა',
    description:
      'Create an automation rule that runs an action when a trigger fires; it is active immediately. Pick trigger and action from automation_catalog; returns the new rule.',
    method: 'post',
    path: '/automation/rules',
    destructive: false,
    body: createAutomationRuleSchema,
  },
  {
    name: 'update_automation_rule',
    title: 'Update automation rule',
    titleKa: 'ავტომატიზაციის წესის რედაქტირება',
    description:
      "Edit an automation rule's name, trigger, timing or action and return the updated rule. Use toggle_automation_rule to pause or resume it.",
    method: 'patch',
    path: '/automation/rules/:id',
    destructive: false,
    body: updateAutomationRuleSchema,
    params: id,
  },
  {
    name: 'toggle_automation_rule',
    title: 'Activate / pause automation rule',
    titleKa: 'ავტომატიზაციის ჩართვა ან შეჩერება',
    description:
      'Pause or resume an automation rule and return the updated rule. Templates cannot be activated.',
    method: 'post',
    path: '/automation/rules/:id/toggle',
    destructive: true,
    body: toggleAutomationRuleSchema,
    params: id,
  },
  {
    name: 'save_automation_as_template',
    title: 'Save automation as template',
    titleKa: 'ავტომატიზაციის შაბლონად შენახვა',
    description:
      'Copy an automation rule into a new inactive reusable template and return the template. The original rule is unchanged.',
    method: 'post',
    path: '/automation/rules/:id/save-as-template',
    destructive: false,
    body: saveAsTemplateSchema,
    params: id,
  },
  {
    name: 'delete_automation_rule',
    title: 'Delete automation rule',
    titleKa: 'ავტომატიზაციის წესის წაშლა',
    description:
      'Permanently delete an automation rule and its run history. Use toggle_automation_rule to pause it instead.',
    method: 'del',
    path: '/automation/rules/:id',
    destructive: true,
    params: id,
  },
]);
