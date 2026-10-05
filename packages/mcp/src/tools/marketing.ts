import { z } from 'zod';
import {
  createAudienceSegmentSchema,
  createCampaignSchema,
  createMessageTemplateSchema,
  createPromoCodeSchema,
  listCampaignsQuerySchema,
  listPromoCodesQuerySchema,
  previewAudienceSchema,
  saveCampaignAsTemplateSchema,
  scheduleCampaignSchema,
  togglePromoCodeSchema,
  updateAudienceSegmentSchema,
  updateCampaignSchema,
  updateMessageTemplateSchema,
  updatePromoCodeSchema,
  validatePromoCodeSchema,
} from '@fit/types';
import {
  listOf,
  slimCampaign,
  slimMessageTemplate,
  slimPromoCode,
  slimSegment,
} from './projections';
import { defineTools } from './shared';

const id = { id: z.string().min(1) };

/** Tenant-scoped endpoints in apps/api/src/marketing/marketing.controller.ts. */
export const marketingTools = defineTools('marketing', [
  {
    name: 'marketing_catalog',
    title: 'Marketing catalog',
    titleKa: 'მარკეტინგის კატალოგი',
    description:
      'List the campaign channels and the merge fields a message may use, such as the member first name. Use before writing a campaign or message template.',
    method: 'get',
    path: '/marketing/catalog',
  },
  {
    name: 'list_audience_segments',
    project: listOf(slimSegment),
    title: 'List audience segments',
    titleKa: 'აუდიტორიის სეგმენტები',
    description:
      'List saved audience segments, newest first, with id, name and last update. Use preview_marketing_saved_segment to see who a segment matches.',
    method: 'get',
    path: '/marketing/segments',
  },
  {
    name: 'preview_marketing_segment',
    title: 'Preview marketing segment',
    titleKa: 'სეგმენტის გადახედვა',
    description:
      'Count the members matching ad-hoc audience criteria and return a sample of them, without saving anything. Use to size an audience before create_audience_segment.',
    method: 'post',
    path: '/marketing/segments/preview',
    destructive: false,
    body: previewAudienceSchema,
  },
  {
    name: 'preview_marketing_saved_segment',
    title: 'Preview marketing saved segment',
    titleKa: 'შენახული სეგმენტის გადახედვა',
    description:
      'Count the members a saved audience segment matches today and return a sample of them. Segment ids come from list_audience_segments.',
    method: 'get',
    path: '/marketing/segments/:id/preview',
    params: id,
  },
  {
    name: 'create_audience_segment',
    title: 'Create audience segment',
    titleKa: 'სეგმენტის შექმნა',
    description:
      'Save named audience criteria as a reusable segment and return it. Check the size first with preview_marketing_segment.',
    method: 'post',
    path: '/marketing/segments',
    destructive: false,
    body: createAudienceSegmentSchema,
  },
  {
    name: 'update_audience_segment',
    title: 'Update audience segment',
    titleKa: 'სეგმენტის რედაქტირება',
    description:
      'Rename a saved audience segment or change its criteria and return the updated segment. Campaigns using it pick up the new audience.',
    method: 'patch',
    path: '/marketing/segments/:id',
    destructive: false,
    body: updateAudienceSegmentSchema,
    params: id,
  },
  {
    name: 'delete_marketing_segment',
    title: 'Delete marketing segment',
    titleKa: 'სეგმენტის წაშლა',
    description:
      'Permanently delete a saved audience segment. Segment ids come from list_audience_segments.',
    method: 'del',
    path: '/marketing/segments/:id',
    destructive: true,
    params: id,
  },
  {
    name: 'list_message_templates',
    project: listOf(slimMessageTemplate),
    title: 'List message templates',
    titleKa: 'შეტყობინების შაბლონები',
    description:
      'List reusable message templates, newest first: id, name, channel, category and subject. Use to start a campaign from existing copy.',
    method: 'get',
    path: '/marketing/templates',
  },
  {
    name: 'create_message_template',
    title: 'Create message template',
    titleKa: 'შაბლონის შექმნა',
    description:
      'Save a reusable message template with a name, channel, optional subject and body, and return it. Merge fields are listed by marketing_catalog.',
    method: 'post',
    path: '/marketing/templates',
    destructive: false,
    body: createMessageTemplateSchema,
  },
  {
    name: 'update_message_template',
    title: 'Update message template',
    titleKa: 'შაბლონის რედაქტირება',
    description:
      "Edit a message template's name, channel, subject or body and return the updated template. Campaigns already created keep their own copy.",
    method: 'patch',
    path: '/marketing/templates/:id',
    destructive: false,
    body: updateMessageTemplateSchema,
    params: id,
  },
  {
    name: 'delete_marketing_template',
    title: 'Delete marketing template',
    titleKa: 'შაბლონის წაშლა',
    description:
      'Permanently delete a message template. Template ids come from list_message_templates.',
    method: 'del',
    path: '/marketing/templates/:id',
    destructive: true,
    params: id,
  },
  {
    name: 'list_promo_codes',
    project: listOf(slimPromoCode),
    title: 'List promo codes',
    titleKa: 'პრომო კოდების სია',
    description:
      'List discount promo codes, newest first, or those usable at one branch: code, status, discount type and value, uses and expiry. Use validate_marketing_promo_code to test one.',
    method: 'get',
    path: '/marketing/promo-codes',
    query: listPromoCodesQuerySchema,
  },
  {
    name: 'validate_marketing_promo_code',
    title: 'Validate marketing promo code',
    titleKa: 'პრომო კოდის შემოწმება',
    description:
      'Check whether a promo code applies, and for an amount how much it takes off, without using it up. Use before redeem_marketing_promo_code.',
    method: 'post',
    path: '/marketing/promo-codes/validate',
    destructive: false,
    body: validatePromoCodeSchema,
  },
  {
    name: 'redeem_marketing_promo_code',
    title: 'Redeem marketing promo code',
    titleKa: 'პრომო კოდის გამოყენება',
    description:
      'Use up one redemption of a promo code after checking its status, expiry, usage limit and minimum purchase. Returns the discount applied; validate first if unsure.',
    method: 'post',
    path: '/marketing/promo-codes/redeem',
    destructive: false,
    body: validatePromoCodeSchema,
  },
  {
    name: 'create_promo_code',
    title: 'Create promo code',
    titleKa: 'პრომო კოდის შექმნა',
    description:
      'Create a percentage or fixed-amount promo code with optional limits, dates and branch, and return it. The code text must be unique.',
    method: 'post',
    path: '/marketing/promo-codes',
    destructive: false,
    body: createPromoCodeSchema,
  },
  {
    name: 'update_promo_code',
    title: 'Update promo code',
    titleKa: 'პრომო კოდის რედაქტირება',
    description:
      "Edit a promo code's discount, limits, dates, scope or branch and return the updated code. Discount changes alter what customers pay.",
    method: 'patch',
    path: '/marketing/promo-codes/:id',
    destructive: true,
    body: updatePromoCodeSchema,
    params: id,
  },
  {
    name: 'toggle_promo_code',
    title: 'Activate / deactivate promo code',
    titleKa: 'პრომო კოდის ჩართვა ან გამორთვა',
    description:
      'Switch a promo code on or off and return the updated code. Deactivating it stops it working at checkout immediately.',
    method: 'post',
    path: '/marketing/promo-codes/:id/toggle',
    destructive: true,
    body: togglePromoCodeSchema,
    params: id,
  },
  {
    name: 'delete_marketing_promo_code',
    title: 'Delete marketing promo code',
    titleKa: 'პრომო კოდის წაშლა',
    description:
      'Permanently delete a promo code. Prefer toggle_promo_code to switch it off while keeping its history.',
    method: 'del',
    path: '/marketing/promo-codes/:id',
    destructive: true,
    params: id,
  },
  {
    name: 'list_campaigns',
    project: listOf(slimCampaign),
    title: 'List campaigns',
    titleKa: 'კამპანიების სია',
    description:
      'List marketing campaigns page by page: id, name, status, channel, scheduled time, audience size and sent count. Use get_marketing_campaign for the message and audience.',
    method: 'get',
    path: '/marketing/campaigns',
    query: listCampaignsQuerySchema,
  },
  {
    name: 'get_marketing_campaign',
    title: 'Get marketing campaign',
    titleKa: 'კამპანიის დეტალები',
    description:
      'Read one campaign in full: channel, audience, subject, body, schedule, status and delivery counts. Use before update_campaign, send_campaign or schedule_campaign.',
    method: 'get',
    path: '/marketing/campaigns/:id',
    params: id,
  },
  {
    name: 'create_campaign',
    title: 'Create campaign',
    titleKa: 'კამპანიის შექმნა',
    description:
      'Create a draft campaign with a channel, audience and message; nothing is sent. Returns the draft; send it with send_campaign or schedule_campaign.',
    method: 'post',
    path: '/marketing/campaigns',
    destructive: false,
    body: createCampaignSchema,
  },
  {
    name: 'update_campaign',
    title: 'Update campaign',
    titleKa: 'კამპანიის რედაქტირება',
    description:
      "Edit a campaign's audience, message or channel before it is sent and return the updated campaign. Sent campaigns cannot be changed.",
    method: 'patch',
    path: '/marketing/campaigns/:id',
    destructive: false,
    body: updateCampaignSchema,
    params: id,
  },
  {
    name: 'send_campaign',
    title: 'Send campaign now',
    titleKa: 'კამპანიის გაგზავნა ახლავე',
    description:
      'Send a campaign to its whole audience immediately and return it with status and sent count. Check get_marketing_campaign and the audience size first.',
    method: 'post',
    path: '/marketing/campaigns/:id/send',
    destructive: true,
    params: id,
  },
  {
    name: 'schedule_campaign',
    title: 'Schedule campaign',
    titleKa: 'კამპანიის დაგეგმვა',
    description:
      'Schedule a campaign to go out automatically at a future scheduledAt and return the updated campaign. Use send_campaign to send right away.',
    method: 'post',
    path: '/marketing/campaigns/:id/schedule',
    destructive: true,
    body: scheduleCampaignSchema,
    params: id,
  },
  {
    name: 'save_marketing_campaign_as_template',
    title: 'Save marketing campaign as template',
    titleKa: 'კამპანიის შაბლონად შენახვა',
    description:
      "Copy a campaign's message into a new reusable message template and return the template.",
    method: 'post',
    path: '/marketing/campaigns/:id/save-as-template',
    destructive: false,
    body: saveCampaignAsTemplateSchema,
    params: id,
  },
  {
    name: 'delete_marketing_campaign',
    title: 'Delete marketing campaign',
    titleKa: 'კამპანიის წაშლა',
    description: 'Permanently delete a marketing campaign. Campaign ids come from list_campaigns.',
    method: 'del',
    path: '/marketing/campaigns/:id',
    destructive: true,
    params: id,
  },
]);
