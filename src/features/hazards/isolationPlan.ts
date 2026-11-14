import { z } from 'zod';

export const ACTIVITIES = ['Plant care', 'Exercise', 'Reading', 'Creative work', 'Group recreation'] as const;
export const PLAN_TASKS = ['sleep', 'lighting', 'contact', 'activity'] as const;

const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).or(z.literal(''));

export const isolationPlanSchema = z.object({
  sleepAt: time,
  wakeAt: time,
  contactAt: time,
  activityAt: time,
  activity: z.enum(ACTIVITIES).or(z.literal('')),
  contactMethod: z.enum(['Written message', 'Recorded voice', 'Recorded video']).or(z.literal('')),
  completed: z.array(z.enum(PLAN_TASKS)),
});

export type IsolationPlan = z.infer<typeof isolationPlanSchema>;
export type IsolationPlanTask = (typeof PLAN_TASKS)[number];

export const emptyIsolationPlan: IsolationPlan = {
  sleepAt: '', wakeAt: '', contactAt: '', activityAt: '', activity: '', contactMethod: '', completed: [],
};
